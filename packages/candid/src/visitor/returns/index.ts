import { isQuery } from "../helpers"
import { checkTextFormat, checkNumberFormat } from "../constants"
import { formatLabel } from "../arguments/helpers"
import { MetadataError } from "../arguments/types"
import type {
  ResultNode,
  ResolvedNode,
  VisitorDataType,
  MethodMeta,
  ServiceMeta,
  MethodResult,
  NumberFormat,
  TextFormat,
} from "./types"

import { sha256 } from "@noble/hashes/sha2.js"
import { IDL } from "@icp-sdk/core/candid"
import { DisplayCodecVisitor, uint8ArrayToHex } from "@ic-reactor/core"
import type {
  ActorMethodReturnType,
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core"

export * from "./types"

// ════════════════════════════════════════════════════════════════════════════
// Node Factory - Eliminates Boilerplate
// ════════════════════════════════════════════════════════════════════════════

type Codec = { decode: (v: unknown) => unknown }

/**
 * Creates a primitive node with automatic resolve implementation.
 */
function primitiveNode<T extends VisitorDataType>(
  type: T,
  label: string,
  candidType: string,
  displayType: ResultNode["displayType"],
  codec: Codec,
  extras: object = {}
): ResultNode<T> {
  const node: ResultNode<T> = {
    type,
    label,
    displayLabel: formatLabel(label),
    candidType,
    displayType,
    ...extras,
    resolve(data: unknown): ResolvedNode<T> {
      try {
        return {
          ...node,
          value: codec.decode(data),
          raw: data,
        } as unknown as ResolvedNode<T>
      } catch (e) {
        throw new MetadataError(
          `Failed to decode: ${e instanceof Error ? e.message : String(e)}`,
          label,
          candidType
        )
      }
    },
  } as unknown as ResultNode<T>
  return node
}

// ════════════════════════════════════════════════════════════════════════════
// Simplified Result Field Visitor
// ════════════════════════════════════════════════════════════════════════════

export class ResultFieldVisitor<A = BaseActor> extends IDL.Visitor<
  string,
  ResultNode | MethodMeta<A> | ServiceMeta<A>
> {
  private codec = new DisplayCodecVisitor()

  private recCache = new Map<IDL.RecClass<any>, ResultNode<"recursive">>()

  private getCodec(t: IDL.Type): Codec {
    const codec = t.accept(this.codec, null) as any
    return {
      decode: (v: unknown) => {
        try {
          return typeof codec?.decode === "function" ? codec.decode(v) : v
        } catch {
          return v
        }
      },
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Service & Function
  // ══════════════════════════════════════════════════════════════════════════

  public visitService(t: IDL.ServiceClass): ServiceMeta<A> {
    const result = {} as ServiceMeta<A>
    for (const [name, func] of t._fields) {
      result[name as FunctionName<A>] = func.accept(this, name) as MethodMeta<A>
    }
    return result
  }

  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodMeta<A> {
    const functionType: FunctionType = isQuery(t) ? "query" : "update"
    const returns = t.retTypes.map((ret, i) =>
      ret.accept(this, `__ret${i}`)
    ) as ResultNode[]

    return {
      functionType,
      functionName,
      returns,
      returnCount: t.retTypes.length,
      resolve: (
        data: ActorMethodReturnType<A[FunctionName<A>]>
      ): MethodResult<A> => {
        const dataArray = returns.length <= 1 ? [data] : (data as unknown[])
        return {
          functionType,
          functionName,
          results: returns.map((node, i) => node.resolve(dataArray[i])),
          raw: data,
        }
      },
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Compound Types
  // ══════════════════════════════════════════════════════════════════════════

  public visitRecord(
    _t: IDL.RecordClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): ResultNode<"record"> {
    const fields: Record<string, ResultNode> = {}
    for (const [key, type] of fields_) {
      fields[key] = type.accept(this, key) as ResultNode
    }

    const node: ResultNode<"record"> = {
      type: "record",
      label,
      displayLabel: formatLabel(label),
      candidType: "record",
      displayType: "object",
      fields,
      resolve(data: unknown): ResolvedNode<"record"> {
        if (data === null || data === undefined) {
          throw new MetadataError(
            `Expected record, but got ${data === null ? "null" : "undefined"}`,
            label,
            "record"
          )
        }
        const recordData = data as Record<string, unknown>
        const resolvedFields: Record<string, ResolvedNode> = {}
        let index = 0
        for (const [key, field] of Object.entries(fields)) {
          // Try named key first, then try numeric index (for tuples/indexed records)
          const value =
            recordData[key] !== undefined ? recordData[key] : recordData[index]

          if (!field || typeof field.resolve !== "function") {
            throw new MetadataError(
              `Field "${key}" is not a valid ResultNode`,
              `${label}.${key}`,
              "record"
            )
          }

          resolvedFields[key] = field.resolve(value)
          index++
        }
        return { ...node, fields: resolvedFields, raw: data }
      },
    }
    return node
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): ResultNode<"variant"> {
    const options: Record<string, ResultNode> = {}
    for (const [key, type] of fields_) {
      options[key] = type.accept(this, key) as ResultNode
    }
    const isResult =
      ("Ok" in options && "Err" in options) ||
      ("ok" in options && "err" in options)
    const isNullVariant =
      !isResult &&
      Object.values(options).every((option) => option.type === "null")
    const node: ResultNode<"variant"> = {
      type: "variant",
      label,
      displayLabel: formatLabel(label),
      candidType: "variant",
      displayType: isResult
        ? "result"
        : isNullVariant
          ? "variant-null"
          : "variant",
      options,
      selectedValue: {} as ResultNode, // placeholder, populated on resolve
      resolve(data: unknown): ResolvedNode<"variant"> {
        if (data === null || data === undefined) {
          throw new MetadataError(
            `Expected variant, but got ${data === null ? "null" : "undefined"}`,
            label,
            "variant"
          )
        }
        const variantData = data as Record<string, unknown>
        // Support both raw { Selected: value } and transformed { _type: 'Selected', Selected: value }
        const selected =
          (variantData._type as string) || Object.keys(variantData)[0]
        const optionNode = options[selected]

        if (!optionNode) {
          throw new MetadataError(
            `Option "${selected}" not found. Available: ${Object.keys(options).join(", ")}`,
            label,
            "variant"
          )
        }
        return {
          ...node,
          selected,
          selectedValue: optionNode.resolve(variantData[selected]),
          raw: data,
        }
      },
    }
    return node
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): ResultNode<"tuple"> {
    const items = components.map(
      (t, i) => t.accept(this, `_${i}`) as ResultNode
    )

    const node: ResultNode<"tuple"> = {
      type: "tuple",
      label,
      displayLabel: formatLabel(label),
      candidType: "tuple",
      displayType: "array",
      items,
      resolve(data: unknown): ResolvedNode<"tuple"> {
        if (data === null || data === undefined || !Array.isArray(data)) {
          throw new MetadataError(
            `Expected tuple, but got ${typeof data}`,
            label,
            "tuple"
          )
        }
        const tupleData = data as unknown[]
        return {
          ...node,
          items: items.map((item, i) => item.resolve(tupleData[i])),
          raw: data,
        }
      },
    }
    return node
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): ResultNode<"optional"> {
    const inner = ty.accept(this, label) as ResultNode

    const node: ResultNode<"optional"> = {
      type: "optional",
      label,
      displayLabel: formatLabel(label),
      candidType: "opt",
      displayType: "nullable",
      value: null, // null until resolved
      resolve(data: unknown): ResolvedNode<"optional"> {
        // If data is an array (raw format [T] or []), unwrap it.
        // Otherwise, use data directly (already transformed or null/undefined).
        const resolved = Array.isArray(data)
          ? data.length > 0
            ? inner.resolve(data[0])
            : null
          : data !== null && data !== undefined
            ? inner.resolve(data)
            : null

        return { ...node, value: resolved, raw: data }
      },
    }
    return node
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): ResultNode<"vector"> | ResultNode<"blob"> {
    // Blob detection (vec nat8)
    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) {
      const codec = this.getCodec(_t)
      const node: ResultNode<"blob"> = {
        type: "blob",
        label,
        displayLabel: formatLabel(label),
        candidType: "blob",
        displayType: "string",
        length: 0,
        hash: "",
        value: "", // empty schema placeholder, populated on resolve
        resolve(data: unknown): ResolvedNode<"blob"> {
          const value = codec.decode(data) as string | Uint8Array
          return {
            ...node,
            value,
            displayType: typeof value === "string" ? "string" : "blob",
            hash: uint8ArrayToHex(
              sha256(
                data instanceof Uint8Array
                  ? data
                  : new Uint8Array(data as number[])
              )
            ),
            length: value.length,
            raw: data,
          }
        },
      }
      return node
    }

    const itemSchema = ty.accept(this, "item") as ResultNode

    const node: ResultNode<"vector"> = {
      type: "vector",
      label,
      displayLabel: formatLabel(label),
      candidType: "vec",
      displayType: "array",
      items: [], // empty schema placeholder, populated on resolve
      resolve(data: unknown): ResolvedNode<"vector"> {
        if (data === null || data === undefined || !Array.isArray(data)) {
          throw new MetadataError(
            `Expected vector, but got ${typeof data}`,
            label,
            "vec"
          )
        }
        const vectorData = data as unknown[]
        return {
          ...node,
          items: vectorData.map((v) => itemSchema.resolve(v)),
          raw: data,
        }
      },
    }
    return node
  }

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): ResultNode<"recursive"> {
    if (this.recCache.has(t)) {
      return this.recCache.get(t)! as ResultNode<"recursive">
    }

    const self = this
    // Lazy extraction to prevent infinite loops
    let innerSchema: ResultNode | null = null
    const getInner = () =>
      (innerSchema ??= ty.accept(self, label) as ResultNode)

    const node: ResultNode<"recursive"> = {
      type: "recursive",
      label,
      displayLabel: formatLabel(label),
      candidType: "rec",
      displayType: "recursive",
      inner: {} as ResultNode, // placeholder, populated on resolve
      resolve(data: unknown): ResolvedNode<"recursive"> {
        return { ...node, inner: getInner().resolve(data), raw: data }
      },
    }

    this.recCache.set(t, node)
    return node
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Primitives - Using Factory
  // ══════════════════════════════════════════════════════════════════════════

  public visitPrincipal(
    t: IDL.PrincipalClass,
    label: string
  ): ResultNode<"principal"> {
    return primitiveNode(
      "principal",
      label,
      "principal",
      "string",
      this.getCodec(t),
      {
        format: checkTextFormat(label) as TextFormat,
      }
    )
  }

  public visitText(t: IDL.TextClass, label: string): ResultNode<"text"> {
    return primitiveNode("text", label, "text", "string", this.getCodec(t), {
      format: checkTextFormat(label) as TextFormat,
    })
  }

  public visitBool(t: IDL.BoolClass, label: string): ResultNode<"boolean"> {
    return primitiveNode("boolean", label, "bool", "boolean", this.getCodec(t))
  }

  public visitNull(t: IDL.NullClass, label: string): ResultNode<"null"> {
    return primitiveNode("null", label, "null", "null", this.getCodec(t))
  }

  public visitInt(t: IDL.IntClass, label: string): ResultNode<"number"> {
    return primitiveNode("number", label, "int", "string", this.getCodec(t), {
      format: checkNumberFormat(label) as NumberFormat,
    })
  }

  public visitNat(t: IDL.NatClass, label: string): ResultNode<"number"> {
    return primitiveNode("number", label, "nat", "string", this.getCodec(t), {
      format: checkNumberFormat(label) as NumberFormat,
    })
  }

  public visitFloat(t: IDL.FloatClass, label: string): ResultNode<"number"> {
    return primitiveNode(
      "number",
      label,
      `float${t._bits}`,
      "number",
      this.getCodec(t),
      {
        format: checkNumberFormat(label) as NumberFormat,
      }
    )
  }

  public visitFixedInt(
    t: IDL.FixedIntClass,
    label: string
  ): ResultNode<"number"> {
    const bits = t._bits
    return primitiveNode(
      "number",
      label,
      `int${bits}`,
      bits <= 32 ? "number" : "string",
      this.getCodec(t),
      {
        format: checkNumberFormat(label) as NumberFormat,
      }
    )
  }

  public visitFixedNat(
    t: IDL.FixedNatClass,
    label: string
  ): ResultNode<"number"> {
    const bits = t._bits
    return primitiveNode(
      "number",
      label,
      `nat${bits}`,
      bits <= 32 ? "number" : "string",
      this.getCodec(t),
      {
        format: checkNumberFormat(label) as NumberFormat,
      }
    )
  }

  public visitType<T>(_t: IDL.Type<T>, label: string): ResultNode<"unknown"> {
    return primitiveNode("unknown", label, "unknown", "unknown", {
      decode: (v) => v,
    })
  }
}
