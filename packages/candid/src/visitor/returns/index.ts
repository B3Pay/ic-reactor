import { isQuery } from "../helpers.js"
import { labelValue } from "../label.js"
import { methodFunc } from "../method-func.js"
import { checkTextFormat, checkNumberFormat } from "../constants.js"
import { formatLabel } from "../arguments/helpers.js"
import {
  MetadataError,
  NumberFormat,
  TextFormat,
  VisitorDataType,
} from "../arguments/types.js"
import type {
  ResultNode,
  ResolvedNode,
  MethodMeta,
  ServiceMeta,
  MethodResult,
} from "./types.js"

import { sha256 } from "@noble/hashes/sha2.js"
import { IDL } from "@icp-sdk/core/candid"
import {
  DisplayCodecVisitor,
  uint8ArrayToHex,
  hexToUint8Array,
} from "@ic-reactor/core"
import type {
  ActorMethodReturnType,
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core"

export * from "./types.js"

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

/**
 * A vector's elements, or `undefined` when `data` is not a vector.
 *
 * `IDL.decode` returns a typed array, not an Array, for every fixed-width
 * integer vector other than blob: `vec nat64` is a `BigUint64Array` and
 * `vec int8` an `Int8Array`. Accepting only arrays made the metadata reactors
 * throw "Expected vector" on any method returning one.
 */
function vectorElements(data: unknown): unknown[] | undefined {
  if (Array.isArray(data)) return data
  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    return Array.from(data as unknown as ArrayLike<unknown>)
  }
  return undefined
}

/** Whether `type` is `vec record { text; V }`, which displays as an object. */
function isTextKeyedVec(type: IDL.Type): boolean {
  return (
    type instanceof IDL.VecClass &&
    type._type instanceof IDL.TupleClass &&
    type._type._fields.length === 2 &&
    type._type._fields[0][1] instanceof IDL.TextClass
  )
}

/**
 * Whether `value` could be a value of `type`, in its Candid form or display
 * transformed, judged only by where arrays can appear: every type that
 * displays as an array (vec, tuple, func reference, and an optional holding
 * one) needs an array there, and every other type needs something that is not
 * one.
 */
function hasDisplayShape(type: IDL.Type, value: unknown, depth = 0): boolean {
  // A recursive type that never reaches a constructor has no shape to find.
  if (depth > 64) return true

  if (type instanceof IDL.RecClass) {
    const inner = type.getType()
    return inner === undefined || hasDisplayShape(inner, value, depth + 1)
  }
  if (type instanceof IDL.OptClass) {
    if (value === null || value === undefined) return true
    if (Array.isArray(value) && value.length === 0) return true
    if (
      Array.isArray(value) &&
      value.length === 1 &&
      hasDisplayShape(type._type, value[0], depth + 1)
    ) {
      return true
    }
    return hasDisplayShape(type._type, value, depth + 1)
  }
  if (type instanceof IDL.VecClass) {
    const elem = type._type
    if (elem instanceof IDL.FixedNatClass && elem._bits === 8) {
      return (
        typeof value === "string" ||
        value instanceof Uint8Array ||
        (Array.isArray(value) && value.every((b) => typeof b === "number"))
      )
    }
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      return (
        elem instanceof IDL.FixedNatClass ||
        elem instanceof IDL.FixedIntClass ||
        elem instanceof IDL.FloatClass
      )
    }
    if (Array.isArray(value)) {
      return value.every((item) => hasDisplayShape(elem, item, depth + 1))
    }
    return isTextKeyedVec(type) && typeof value === "object" && value !== null
  }
  if (type instanceof IDL.TupleClass) {
    const components = type._fields.map(([, component]) => component)
    return (
      Array.isArray(value) &&
      value.length >= components.length &&
      components.every((component, i) =>
        hasDisplayShape(component, value[i], depth + 1)
      )
    )
  }
  if (type instanceof IDL.FuncClass) {
    return Array.isArray(value) && value.length === 2
  }
  if (type instanceof IDL.EmptyClass) return false
  if (type instanceof IDL.ReservedClass) return true
  return !Array.isArray(value)
}

/**
 * The Candid value a resolved node stands for, read back from the tree.
 *
 * `resolve()` takes a value in its Candid form or already display-transformed,
 * such as an unwrapped `opt` or a record given as a tuple, and builds the same
 * tree from either. Compound values are rebuilt from that tree so the display
 * codec always decodes the Candid shape. Primitives keep `raw`, because their
 * codecs decode both forms.
 */
function candidValueOf(node: ResultNode): unknown {
  switch (node.type) {
    case "optional":
      return node.value ? [candidValueOf(node.value)] : []
    case "record":
    case "funcRecord":
      return Object.fromEntries(
        Object.entries(node.fields).map(([key, field]) => [
          key,
          candidValueOf(field),
        ])
      )
    case "tuple":
    case "vector":
      return node.items.map(candidValueOf)
    case "variant":
      return node.selected === undefined
        ? node.raw
        : { [node.selected]: candidValueOf(node.selectedValue) }
    case "recursive":
      return candidValueOf(node.inner)
    default:
      return node.raw
  }
}

/**
 * The value of the record field `key` in `data`: by name, or by position for
 * a record given as a tuple. A name counts only where the value holds it, not
 * on Object.prototype. Read plainly, a field named `toString` or `constructor`
 * that a hand-built value left out resolved to the inherited function, and one
 * named `__proto__`, which IDL.decode does not keep, to Object.prototype.
 */
function recordFieldValue(
  data: Record<string, unknown>,
  key: string,
  index: number
): unknown {
  const named = labelValue(data, key)
  return named !== undefined ? named : data[index]
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

  /**
   * A service type is visited in two places. As the canister's own interface,
   * reached with no label, it yields metadata for each method. As a value, a
   * reference to another canister returned by a method, `accept` passes the
   * field's label, and the value is a principal. That case used to get the
   * method map too, which has no `resolve`, so resolving the result threw
   * "node.resolve is not a function".
   */
  public visitService(t: IDL.ServiceClass): ServiceMeta<A>
  public visitService(
    t: IDL.ServiceClass,
    label: string
  ): ResultNode<"principal">
  public visitService(
    t: IDL.ServiceClass,
    label?: string | null
  ): ServiceMeta<A> | ResultNode<"principal"> {
    if (typeof label === "string") {
      // A service reference is a principal, so it takes the principal codec,
      // which also reads a Principal from another copy of @icp-sdk/core.
      return primitiveNode(
        "principal",
        label,
        "service",
        "string",
        this.getCodec(IDL.Principal),
        { format: checkTextFormat(label) as TextFormat }
      )
    }

    const entries: Array<[string, MethodMeta<A>]> = []
    for (const [name, type] of t._fields) {
      // A method typed by a recursive func alias is an IDL.Rec around the
      // func. Read as the func itself, it had no annotations, and this threw
      // out of initialize() for the whole service.
      const func = methodFunc(type)
      if (!func) continue
      // Process each service method using dedicated method handler
      entries.push([
        name,
        this.visitFuncAsMethod(func, name as FunctionName<A>),
      ])
    }
    // Object.fromEntries makes every method an own property. Assigning to a
    // method named `__proto__` set the prototype instead.
    return Object.fromEntries(entries) as ServiceMeta<A>
  }

  /**
   * Handle func type when encountered as a service method definition.
   * Returns MethodMeta with information about the method's inputs/outputs.
   * This is public so callers can explicitly request method metadata.
   */
  public visitFuncAsMethod(
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

  /**
   * Handle func type when encountered as a data field (e.g., callback in a record).
   * Returns ResultNode that can resolve [Principal, string] data to a func reference.
   */
  public visitFunc(_t: IDL.FuncClass, label: string): ResultNode<"func"> {
    const node: ResultNode<"func"> = {
      type: "func",
      label,
      displayLabel: formatLabel(label),
      candidType: "func",
      displayType: "func",
      canisterId: "", // placeholder, populated on resolve
      methodName: "", // placeholder, populated on resolve
      resolve(data: unknown): ResolvedNode<"func"> {
        // Func values are represented as [Principal, string] tuples
        if (!Array.isArray(data) || data.length !== 2) {
          throw new MetadataError(
            `Expected func reference [Principal, string], but got ${typeof data}`,
            label,
            "func"
          )
        }
        const [principal, methodName] = data
        const canisterId =
          typeof principal === "string"
            ? principal
            : (principal?.toText?.() ?? String(principal))

        return {
          ...node,
          canisterId,
          methodName: String(methodName),
          raw: data,
        }
      },
    }
    return node
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Compound Types
  // ══════════════════════════════════════════════════════════════════════════

  public visitRecord(
    _t: IDL.RecordClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): ResultNode<"record"> | ResultNode<"funcRecord"> {
    const fieldEntries: Array<[string, ResultNode]> = []
    // Track func fields for funcRecord detection
    const funcEntries: Array<{
      key: string
      funcType: IDL.FuncClass
      node: ResultNode<"func">
    }> = []

    for (const [key, type] of fields_) {
      const fieldNode = type.accept(this, key) as ResultNode
      fieldEntries.push([key, fieldNode])

      if (type instanceof IDL.FuncClass) {
        funcEntries.push({
          key,
          funcType: type,
          node: fieldNode as ResultNode<"func">,
        })
      }
    }

    // Object.fromEntries makes every field an own property. Assigning to a
    // field named `__proto__` set the prototype instead, which dropped the
    // field from the result tree.
    const fields: Record<string, ResultNode> = Object.fromEntries(fieldEntries)

    // ── funcRecord: exactly one func field + other argument fields ──
    if (funcEntries.length === 1) {
      const {
        key: funcFieldKey,
        funcType,
        node: funcFieldNode,
      } = funcEntries[0]
      const funcCallType: "query" | "update" = isQuery(funcType)
        ? "query"
        : "update"

      const argFields: Record<string, ResultNode> = Object.fromEntries(
        fieldEntries.filter(([k]) => k !== funcFieldKey)
      )

      // defaultArgs are built from the other fields, and each value goes
      // through the display codec for its field's type, because a resolved
      // node carries a display `value` only for primitives. The codec decodes
      // the Candid value read back from the resolved field, so an already
      // transformed input gives the same result. Two layouts are in
      // use. In the ICP ledger's ArchivedBlocksRange the callback takes
      // `{ start; length }` and the fields beside it are start and length, so
      // together they make the one record argument. In ICRC-3's
      // archived_blocks the callback takes exactly the type of the `args`
      // field, and a streaming strategy's callback takes its `token` field, so
      // that single field is the argument.
      const argEntries = fields_.filter(([k]) => k !== funcFieldKey)
      const argCodecs = Object.fromEntries(
        argEntries.map(([k, type]) => [k, this.getCodec(type)])
      )
      const argIsField =
        funcType.argTypes.length === 1 &&
        argEntries.length === 1 &&
        argEntries[0][1].display() === funcType.argTypes[0].display()

      const node: ResultNode<"funcRecord"> = {
        type: "funcRecord",
        label,
        displayLabel: formatLabel(label),
        candidType: "record",
        displayType: "func-record",
        canisterId: "",
        methodName: "",
        funcType: funcCallType,
        funcClass: funcType,
        funcFieldKey,
        funcField: funcFieldNode,
        argFields,
        fields,
        resolve(data: unknown): ResolvedNode<"funcRecord"> {
          if (data === null || data === undefined) {
            throw new MetadataError(
              `Expected funcRecord, but got ${data === null ? "null" : "undefined"}`,
              label,
              "record"
            )
          }
          const recordData = data as Record<string, unknown>
          const resolvedEntries: Array<[string, ResolvedNode]> = []
          let index = 0
          for (const [key, field] of Object.entries(fields)) {
            const value = recordFieldValue(recordData, key, index)
            resolvedEntries.push([key, field.resolve(value)])
            index++
          }
          const resolvedFields: Record<string, ResolvedNode> =
            Object.fromEntries(resolvedEntries)

          const resolvedFuncField = resolvedFields[
            funcFieldKey
          ] as ResolvedNode<"func">

          const resolvedArgFields: Record<string, ResolvedNode> =
            Object.fromEntries(
              resolvedEntries.filter(([k]) => k !== funcFieldKey)
            )

          // Build display-type default args ready for callMethod
          const argRecord = Object.fromEntries(
            Object.entries(resolvedArgFields).map(([k, v]) => [
              k,
              argCodecs[k].decode(candidValueOf(v)),
            ])
          )
          const defaultArgs =
            funcType.argTypes.length === 0
              ? []
              : argIsField
                ? Object.values(argRecord)
                : [argRecord]

          return {
            ...node,
            canisterId: resolvedFuncField.canisterId,
            methodName: resolvedFuncField.methodName,
            funcField: resolvedFuncField,
            argFields: resolvedArgFields,
            fields: resolvedFields,
            defaultArgs,
            raw: data,
          }
        },
      }
      return node
    }

    // ── Regular record ──
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
        const resolvedEntries: Array<[string, ResolvedNode]> = []
        let index = 0
        for (const [key, field] of Object.entries(fields)) {
          // Try named key first, then try numeric index (for tuples/indexed records)
          const value = recordFieldValue(recordData, key, index)

          if (!field || typeof field.resolve !== "function") {
            throw new MetadataError(
              `Field "${key}" is not a valid ResultNode`,
              `${label}.${key}`,
              "record"
            )
          }

          resolvedEntries.push([key, field.resolve(value)])
          index++
        }
        return {
          ...node,
          fields: Object.fromEntries(resolvedEntries),
          raw: data,
        }
      },
    }
    return node
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): ResultNode<"variant"> {
    // Object.fromEntries makes every option an own property. Assigning to a
    // tag named `__proto__` set the prototype instead, which dropped the
    // option from `options`, and from the check for a variant of null options.
    const options: Record<string, ResultNode> = Object.fromEntries(
      fields_.map(([key, type]) => [key, type.accept(this, key) as ResultNode])
    )
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
            `Expected variant, but got ${data === null ? "null" : "undefined"}, raw: ${data}`,
            label,
            "variant"
          )
        }
        const variantData = data as Record<string, unknown>
        // Support both raw { Selected: value } and transformed { _type: 'Selected', Selected: value }
        const selected =
          (variantData._type as string) || Object.keys(variantData)[0]
        // Only a variant's own options: a plain read found Object.prototype
        // members, so a `toString` tag the variant lacks threw a TypeError
        // instead of saying the option is not found.
        const optionNode = Object.prototype.hasOwnProperty.call(
          options,
          selected
        )
          ? options[selected]
          : undefined

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
          // `{ _type }` alone leaves the payload out. A plain read then found
          // an inherited member for a tag named `toString` or `constructor`.
          selectedValue: optionNode.resolve(labelValue(variantData, selected)),
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
            `Expected tuple, but got ${data === null ? "null" : typeof data}, raw: ${data}`,
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

    /**
     * Is `[x]` the Candid wrapper around `x`, rather than a display value that
     * is itself a one-element array? Only an unwrapped array, `opt vec text`
     * displayed as ["a"], fits the second reading alone. When both fit, the
     * Candid reading wins, as it always did.
     */
    const isWrapper = (data: [unknown]): boolean =>
      hasDisplayShape(ty, data[0]) || !hasDisplayShape(ty, data)

    const node: ResultNode<"optional"> = {
      type: "optional",
      label,
      displayLabel: formatLabel(label),
      candidType: "opt",
      displayType: "nullable",
      value: null, // null until resolved
      resolve(data: unknown): ResolvedNode<"optional"> {
        // An array is the Candid form, `[]` for none and `[x]` for some,
        // unless it is a display-transformed value of an element that
        // displays as an array: `opt vec text` as ["a", "b"] or
        // `opt record { nat; nat }` as ["1", "2"]. Reading those as the
        // wrapper resolved their first item and threw. A Candid wrapper never
        // has two items. Anything else is display-transformed or none.
        const resolved =
          data === null || data === undefined
            ? null
            : !Array.isArray(data)
              ? inner.resolve(data)
              : data.length === 0
                ? null
                : data.length === 1 && isWrapper(data as [unknown])
                  ? inner.resolve(data[0])
                  : inner.resolve(data)

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
          // The display codec renders every blob as a hex string regardless
          // of size, so `displayType` stays the schema's "string" and
          // `length` can finally be what its type declares: bytes, not hex
          // characters.
          //
          // `data` is raw candid bytes on the normal reactor flow, but
          // visitOpt hands already-transformed inner values through, so a
          // hex string is a supported shape here. It must not fall into a
          // `new Uint8Array(...)` coercion: a string (or null) taken through
          // the TypedArray length constructor yields ZERO bytes, fabricating
          // `length: 0` and a sha256 of the empty payload for a real blob.
          const bytes =
            data instanceof Uint8Array
              ? data
              : Array.isArray(data)
                ? new Uint8Array(data)
                : typeof data === "string"
                  ? hexToUint8Array(data)
                  : null
          if (bytes === null) {
            throw new MetadataError(
              `Expected blob bytes or hex string, but got ${data === null ? "null" : typeof data}`,
              label,
              "blob"
            )
          }
          const value =
            typeof data === "string" ? data : (codec.decode(data) as string)
          return {
            ...node,
            value,
            hash: uint8ArrayToHex(sha256(bytes)),
            length: bytes.length,
            raw: data,
          }
        },
      }
      return node
    }

    const itemSchema = ty.accept(this, "item") as ResultNode
    // `vec record { text; V }` displays as an object keyed by the text, and
    // its entries are the Candid pairs.
    const textKeyed = isTextKeyedVec(_t)

    const node: ResultNode<"vector"> = {
      type: "vector",
      label,
      displayLabel: formatLabel(label),
      candidType: "vec",
      displayType: "array",
      items: [], // empty schema placeholder, populated on resolve
      resolve(data: unknown): ResolvedNode<"vector"> {
        const vectorData =
          vectorElements(data) ??
          (textKeyed && typeof data === "object" && data !== null
            ? Object.entries(data)
            : undefined)
        if (!vectorData) {
          throw new MetadataError(
            `Expected vector, but got ${data === null ? "null" : typeof data}, raw: ${data}`,
            label,
            "vec"
          )
        }
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
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): ResultNode<"recursive"> {
    // A node per occurrence, as the form visitor builds since #385. Caching it
    // per RecClass gave every later occurrence the first one's label, so both
    // subtrees of a binary tree read "__ret0". Building the inner node lazily
    // is what stops the recursion, not the cache.
    //
    // Lazy extraction to prevent infinite loops
    let innerSchema: ResultNode | null = null
    const getInner = () =>
      (innerSchema ??= ty.accept(this, label) as ResultNode)

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

  public visitNull(_t: IDL.NullClass, label: string): ResultNode<"null"> {
    // The only value is null. A display-transformed variant arm without a
    // payload, `{ _type: "none" }`, hands this node undefined, which the
    // null codec refused, leaving the value undefined.
    return primitiveNode("null", label, "null", "null", { decode: () => null })
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
