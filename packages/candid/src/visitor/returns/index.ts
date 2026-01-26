import { isQuery } from "../helpers"
import { checkTextFormat, checkNumberFormat } from "../constants"
import { IDL } from "../types"
import type {
  ResultNode,
  ResolvedNode,
  NodeType,
  MethodMeta,
  ServiceMeta,
  ResolvedMethodResult,
  NumberFormat,
  TextFormat,
} from "./types"

export * from "./types"
import { DisplayCodecVisitor } from "@ic-reactor/core"
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
function primitiveNode<T extends NodeType>(
  type: T,
  label: string,
  candidType: string,
  displayType: ResultNode["displayType"],
  codec: Codec,
  extras: object = {}
): ResultNode<T> {
  const node = {
    type,
    label,
    candidType,
    displayType,
    ...extras,
    resolve(data: unknown): ResolvedNode<T> {
      return {
        ...node,
        value: codec.decode(data),
        raw: data,
      } as ResolvedNode<T>
    },
  } as ResultNode<T>
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

  private getCodec(t: IDL.Type): Codec {
    return t.accept(this.codec, null) as Codec
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
      ): ResolvedMethodResult<A> => {
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
      candidType: "record",
      displayType: "object",
      fields,
      resolve(data: unknown): ResolvedNode<"record"> {
        if (data === null || data === undefined) {
          throw new Error(`Expected record for field ${label}, but got ${data}`)
        }
        const recordData = data as Record<string, unknown>
        const value: Record<string, ResolvedNode> = {}
        for (const [key, field] of Object.entries(fields)) {
          value[key] = field.resolve(recordData[key])
        }
        return { ...node, value, raw: data }
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
    const isResult = "Ok" in options && "Err" in options

    const node: ResultNode<"variant"> = {
      type: "variant",
      label,
      candidType: "variant",
      displayType: isResult ? "result" : "variant",
      options,
      resolve(data: unknown): ResolvedNode<"variant"> {
        if (data === null || data === undefined) {
          throw new Error(
            `Expected variant for field ${label}, but got ${data}`
          )
        }
        const variantData = data as Record<string, unknown>
        const key = Object.keys(variantData)[0]
        const optionNode = options[key]
        if (!optionNode) {
          throw new Error(`Option ${key} not found in variant`)
        }
        return {
          ...node,
          value: { key, node: optionNode.resolve(variantData[key]) },
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
      candidType: "tuple",
      displayType: "array",
      items,
      resolve(data: unknown): ResolvedNode<"tuple"> {
        if (data === null || data === undefined) {
          throw new Error(`Expected tuple for field ${label}, but got ${data}`)
        }
        const tupleData = data as unknown[]
        return {
          ...node,
          value: items.map((item, i) => item.resolve(tupleData[i])),
          raw: data,
        } as ResolvedNode<"tuple">
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
      candidType: "opt",
      displayType: "nullable",
      inner,
      resolve(data: unknown): ResolvedNode<"optional"> {
        const opt = data as T[]
        return {
          ...node,
          value:
            Array.isArray(opt) && opt.length > 0 ? inner.resolve(opt[0]) : null,
          raw: data,
        } as ResolvedNode<"optional">
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
        candidType: "blob",
        displayType: "string",
        displayHint: "hex",
        resolve(data: unknown): ResolvedNode<"blob"> {
          return { ...node, value: codec.decode(data) as string, raw: data }
        },
      }
      return node
    }

    const item = ty.accept(this, "item") as ResultNode

    const node: ResultNode<"vector"> = {
      type: "vector",
      label,
      candidType: "vec",
      displayType: "array",
      item,
      resolve(data: unknown): ResolvedNode<"vector"> {
        if (data === null || data === undefined) {
          throw new Error(`Expected vector for field ${label}, but got ${data}`)
        }
        const vectorData = data as unknown[]
        return {
          ...node,
          value: vectorData.map((v) => item.resolve(v)),
          raw: data,
        } as ResolvedNode<"vector">
      },
    }
    return node
  }

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): ResultNode<"recursive"> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this

    const node: ResultNode<"recursive"> = {
      type: "recursive",
      label,
      candidType: "rec",
      displayType: "recursive",
      typeName: t.name,
      extract: () => ty.accept(self, label) as ResultNode,
      resolve(data: unknown): ResolvedNode<"recursive"> {
        const innerResolved = node.extract().resolve(data)
        return { ...node, value: innerResolved, raw: data }
      },
    }
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
