import * as z from "zod"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { hasLabel } from "../utils/label.js"
import {
  createVariant,
  nonNullish,
  uint8ArrayToHex,
  hexToUint8Array,
  isNullish,
} from "../utils/index.js"

/**
 * A `vec record { text; T }` displays as an object keyed by the text. The key
 * must really be `text`: any other 2-tuple stays a list of pairs.
 */
export function isTextKeyedPair(
  type: IDL.Type
): type is IDL.TupleClass<unknown[]> {
  const fields = type instanceof IDL.TupleClass ? type._fields : undefined
  return fields?.length === 2 && fields[0][1].name === "text"
}

/**
 * Could `value` be the display value of `type`, as the codecs encode it?
 *
 * Only a `false` answer is definite. It is given only where the type's codec,
 * or IDL.encode after it, rejects the value whatever else is true; anything a
 * codec passes through unchecked answers `true`. That makes it safe for
 * settling an ambiguity: preferring the other reading when this says `false`
 * changes nothing that encoded before.
 */
function couldBeDisplayOf(type: IDL.Type, value: unknown, depth = 0): boolean {
  if (depth > 32) return true
  const isObject = typeof value === "object" && value !== null

  if (type instanceof IDL.RecClass) {
    const inner = type.getType()
    return inner ? couldBeDisplayOf(inner, value, depth + 1) : true
  }
  if (type instanceof IDL.ReservedClass) return true
  if (type instanceof IDL.OptClass) {
    // What the optional codec takes: none, the wrapper around one value, or
    // the value itself.
    if (value === undefined || value === null) return true
    if (Array.isArray(value)) {
      if (value.length === 0) return true
      if (
        value.length === 1 &&
        couldBeDisplayOf(type._type, value[0], depth + 1)
      ) {
        return true
      }
    }
    return couldBeDisplayOf(type._type, value, depth + 1)
  }
  if (type instanceof IDL.VecClass) {
    const elem = type._type
    if (elem instanceof IDL.FixedNatClass && elem._bits === 8) {
      // A blob: hex text, bytes, or a plain byte array.
      return (
        typeof value === "string" ||
        value instanceof Uint8Array ||
        Array.isArray(value)
      )
    }
    if (isTextKeyedPair(elem) && !Array.isArray(value)) return isObject
    if (Array.isArray(value)) {
      return value.every((item) => couldBeDisplayOf(elem, item, depth + 1))
    }
    // A typed array passes through to IDL.encode, which takes one only for a
    // vector of numbers of the array's width. A `Uint32Array` can be a
    // `vec nat32`, but a `Uint8Array` is never a `vec blob`: it is one blob.
    const isNumber =
      elem instanceof IDL.FixedNatClass ||
      elem instanceof IDL.FixedIntClass ||
      elem instanceof IDL.FloatClass
    return (
      isNumber &&
      ArrayBuffer.isView(value) &&
      (value as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ===
        elem._bits / 8
    )
  }
  if (type instanceof IDL.TupleClass) {
    const components = type._fields.map(([, component]) => component)
    return (
      Array.isArray(value) &&
      value.length === components.length &&
      components.every((component, i) =>
        couldBeDisplayOf(component, value[i], depth + 1)
      )
    )
  }
  if (type instanceof IDL.FuncClass) {
    return Array.isArray(value) && value.length === 2
  }
  // `null` included: IDL.encode takes it for an empty `record {}`.
  if (type instanceof IDL.RecordClass) return typeof value === "object"
  if (
    type instanceof IDL.VariantClass ||
    type instanceof IDL.PrincipalClass ||
    type instanceof IDL.ServiceClass
  ) {
    const isReference = !(type instanceof IDL.VariantClass)
    return (
      (isReference && typeof value === "string") ||
      (isObject && !Array.isArray(value))
    )
  }
  if (type instanceof IDL.TextClass) return typeof value === "string"
  if (type instanceof IDL.BoolClass) return typeof value === "boolean"
  if (type instanceof IDL.NullClass) return value === null
  if (type instanceof IDL.EmptyClass) return false
  if (type instanceof IDL.NatClass || type instanceof IDL.IntClass) {
    return typeof value === "string"
  }
  if (type instanceof IDL.FixedNatClass || type instanceof IDL.FixedIntClass) {
    return type._bits > 32
      ? typeof value === "string"
      : typeof value === "number" || typeof value === "string"
  }
  if (type instanceof IDL.FloatClass) {
    return typeof value === "number" || typeof value === "string"
  }
  return true
}

/**
 * Does a value of `type` display as an array? A vector, a tuple and a func
 * reference do, and so does an optional of one, since an optional displays as
 * its value.
 */
function displaysAsArray(type: IDL.Type, depth = 0): boolean {
  if (depth > 32) return false
  if (type instanceof IDL.RecClass) {
    const inner = type.getType()
    return inner ? displaysAsArray(inner, depth + 1) : false
  }
  if (type instanceof IDL.OptClass)
    return displaysAsArray(type._type, depth + 1)
  return (
    type instanceof IDL.VecClass ||
    type instanceof IDL.TupleClass ||
    type instanceof IDL.FuncClass
  )
}

/**
 * Is `[inner]`, given for an `opt` of `elemType`, the Candid wrapper around one
 * value, rather than a one-element value of `elemType` itself? See the
 * optional codec's encode below, which decides with this.
 */
export function isOptionalWrapper(
  elemType: IDL.Type,
  inner: unknown,
  elemIsArrayValued = displaysAsArray(elemType)
): boolean {
  return !elemIsArrayValued || couldBeDisplayOf(elemType, inner)
}

const NAT_TEXT = /^\d+$/
const INT_TEXT = /^-?\d+$/

const invalidFixed = (bits: number, signed: boolean, expected: string) =>
  `[ic-reactor] Invalid ${signed ? "int" : "nat"}${bits} display value: expected ${expected}`

/**
 * The number a display value of a fixed-width integer of 32 bits or fewer
 * sends: the number itself, or the number integer text spells. Throws for a
 * value the codec refuses.
 */
function fixedNumberOf(
  bits: number,
  signed: boolean,
  val: string | number
): number {
  const min = signed ? -(2 ** (bits - 1)) : 0
  const max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1
  const num = typeof val === "string" ? Number(val) : val

  if (typeof val === "string" && !(signed ? INT_TEXT : NAT_TEXT).test(val)) {
    throw new TypeError(
      `${invalidFixed(bits, signed, "an integer string")}, got "${val}"`
    )
  }

  if (!Number.isInteger(num)) {
    throw new TypeError(
      `${invalidFixed(bits, signed, "an integer")}, got ${String(val)}`
    )
  }

  if (num < min || num > max) {
    throw new RangeError(
      `${invalidFixed(bits, signed, `${min}..${max}`)}, got ${String(val)}`
    )
  }

  return num
}

/**
 * The number a display value of a float sends: the number itself, or the
 * number text spells. Throws for a value the codec refuses.
 */
function floatNumberOf(bits: number, val: string | number): number {
  const trimmed = typeof val === "string" ? val.trim() : undefined
  if (trimmed === "") {
    throw new TypeError(
      `[ic-reactor] Invalid float${bits} display value: expected a number, got ""`
    )
  }
  const num = trimmed === undefined ? (val as number) : Number(trimmed)
  // A finite double can still overflow float32: IDL.encode narrows
  // 3.4028236e38 to Infinity and sends that, so check the narrowed
  // value for float32, not just the double.
  const narrowed = bits === 32 ? Math.fround(num) : num
  if (!Number.isFinite(narrowed)) {
    throw new TypeError(
      `[ic-reactor] Invalid float${bits} display value: expected a finite float${bits}, got ${String(val)}`
    )
  }
  return num
}

/**
 * The number the codec of a float, or of an integer of 32 bits or fewer,
 * sends for display `text`. Throws for text the codec refuses. The query key
 * reads numeric text with this, so it cannot drift from what the codec sends.
 */
export function numberOfText(
  type: IDL.FixedNatClass | IDL.FixedIntClass | IDL.FloatClass,
  text: string
): number {
  return type instanceof IDL.FloatClass
    ? floatNumberOf(type._bits, text)
    : fixedNumberOf(type._bits, type instanceof IDL.FixedIntClass, text)
}

/** Is `value` a Principal the principal codec takes as it is? */
export function isDisplayPrincipal(value: unknown): value is Principal {
  return value instanceof Principal
}

function createFixedNumberCodec(bits: number, signed: boolean): z.ZodTypeAny {
  const min = signed ? -(2 ** (bits - 1)) : 0
  const max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1

  return z.codec(
    z.number().int().min(min).max(max), // Candid format
    z.union([z.number(), z.string()]), // Display format
    {
      decode: (val) => val,
      encode: (val) => fixedNumberOf(bits, signed, val),
    }
  )
}

/**
 * `nat`, `int`, `nat64` and `int64` display as decimal text and encode through
 * `BigInt`. `BigInt("")` and `BigInt("   ")` both return `0n`, so a blank
 * string has to be refused here or an empty amount field encodes as zero.
 * Any other string still goes to `BigInt`, which throws on non-integer text.
 */
function createBigIntCodec(typeName: string): z.ZodTypeAny {
  return z.codec(
    z.bigint(), // Candid format
    z.string(), // Display format
    {
      decode: (val) => (typeof val === "bigint" ? val.toString() : val),
      encode: (val) => {
        if (typeof val !== "string") return val
        if (val.trim() === "") {
          throw new TypeError(
            `[ic-reactor] Invalid ${typeName} display value: expected an integer string, got "${val}"`
          )
        }
        return BigInt(val)
      },
    }
  )
}

/** A label's value, or `undefined` for one the display value does not hold. */
const labelValue = (value: object, label: string): unknown =>
  hasLabel(value, label) ? (value as Record<string, unknown>)[label] : undefined

/** One direction of a codec, as a plain function. */
type Transform = (value: any) => unknown

/** The functions a pass-through codec runs. */
interface Transforms {
  decode: Transform
  encode: Transform
}

/**
 * The functions of every pass-through codec: those built on `z.any()` at both
 * ends, which is every compound codec (record, variant, vector, optional,
 * tuple, recursive, func and service). zod checks nothing around them and
 * only calls their functions.
 *
 * A compound codec used to reach its children through `codec.decode()` and
 * `codec.encode()`, which enter zod's parse pipeline: about five more stack
 * frames and a new parse context for every child. A Motoko `List<Nat>` is three
 * codecs per element, so displaying one ran out of stack at 586 elements, where
 * IDL.decode decodes about 1,400. DisplayReactor then fell back to the raw
 * Candid value. Children now call these functions directly. What each visit
 * returns is still a zod codec, for callers of `codec.decode()`.
 */
const passThroughTransforms = new WeakMap<z.ZodTypeAny, Transforms>()

/** A codec that changes the value and checks nothing itself. */
function passThroughCodec(transforms: Transforms): z.ZodTypeAny {
  const codec = z.codec(z.any(), z.any(), transforms)
  passThroughTransforms.set(codec, transforms)
  return codec
}

/**
 * How a parent decodes a value of `codec`: the function itself for a
 * pass-through codec, and zod, with its checks, for any other.
 */
function decoderOf(codec: z.ZodTypeAny): Transform {
  return (
    passThroughTransforms.get(codec)?.decode ?? ((value) => codec.decode(value))
  )
}

/** How a parent encodes a value of `codec`. See {@link decoderOf}. */
function encoderOf(codec: z.ZodTypeAny): Transform {
  return (
    passThroughTransforms.get(codec)?.encode ?? ((value) => codec.encode(value))
  )
}

export class DisplayCodecVisitor extends IDL.Visitor<unknown, z.ZodTypeAny> {
  private _recCache = new Map<IDL.RecClass, z.ZodTypeAny>()

  visitType<T>(t: IDL.Type<T>, data: unknown): z.ZodTypeAny {
    return t.accept(this, data)
  }

  visitPrimitive<T>(t: IDL.PrimitiveType<T>, data: unknown): z.ZodTypeAny {
    return t.accept(this, data)
  }

  visitEmpty(_t: IDL.EmptyClass, _data: unknown): z.ZodTypeAny {
    return z.never()
  }

  visitBool(_t: IDL.BoolClass, _data: unknown): z.ZodTypeAny {
    return z.boolean()
  }

  visitNull(_t: IDL.NullClass, _data: unknown): z.ZodTypeAny {
    return z.null()
  }

  visitReserved(_t: IDL.ReservedClass, _data: unknown): z.ZodTypeAny {
    return z.any()
  }

  visitText(_t: IDL.TextClass, _data: unknown): z.ZodTypeAny {
    return z.string()
  }

  visitNumber<T>(t: IDL.PrimitiveType<T>, data: unknown): z.ZodTypeAny {
    return t.accept(this, data)
  }

  visitInt(_t: IDL.IntClass, _data: unknown): z.ZodTypeAny {
    return createBigIntCodec("int")
  }

  visitNat(_t: IDL.NatClass, _data: unknown): z.ZodTypeAny {
    return createBigIntCodec("nat")
  }

  visitFloat(t: IDL.FloatClass, _data: unknown): z.ZodTypeAny {
    // Floats display as numbers, but form metadata holds every numeric field
    // as a string (the visitors in @ic-reactor/candid emit "" and a string
    // schema for float32/float64), so a value that passed the form's own
    // validation must encode here too. Same contract as the ≤32-bit integers.
    //
    // NaN, Infinity and -Infinity are valid float32/float64 values, and
    // IDL.decode returns them as numbers. Zod 4's z.number() rejects all three,
    // so one of them in a result failed the decode of the whole response and
    // DisplayReactor fell back to the raw Candid value. Both schemas accept any
    // number. Encode below still refuses non-finite input with its own error.
    const anyNumber = z.custom<number>((val) => typeof val === "number")
    return z.codec(
      anyNumber, // Candid format
      z.union([anyNumber, z.string()]), // Display format
      {
        decode: (val) => val,
        encode: (val) => floatNumberOf(t._bits, val),
      }
    )
  }

  visitFixedInt(t: IDL.FixedIntClass, _data: unknown): z.ZodTypeAny {
    const bits = t._bits

    if (bits <= 32) {
      // 32-bit integers stay as numbers for display, but form inputs may
      // submit numeric strings that must be converted before IDL.encode.
      return createFixedNumberCodec(bits, true)
    } else {
      // 64-bit integers: bigint ↔ string
      return createBigIntCodec(`int${bits}`)
    }
  }

  visitFixedNat(t: IDL.FixedNatClass, _data: unknown): z.ZodTypeAny {
    const bits = t._bits

    if (bits <= 32) {
      return createFixedNumberCodec(bits, false)
    } else {
      return createBigIntCodec(`nat${bits}`)
    }
  }

  visitPrincipal(_t: IDL.PrincipalClass, _data: unknown): z.ZodTypeAny {
    const stringOrPrincipalSchema = z.union([z.string(), z.any()])

    return z.codec(stringOrPrincipalSchema, stringOrPrincipalSchema, {
      decode: (val) => {
        if (val instanceof Principal) return val.toText()
        if (typeof val === "string") return val
        if (
          val &&
          typeof val === "object" &&
          typeof (val as { toText?: unknown }).toText === "function"
        ) {
          return (val as { toText: () => string }).toText()
        }
        throw new TypeError(
          `[ic-reactor] Cannot decode value as Principal display text: expected a string or Principal instance, got ${typeof val}`
        )
      },
      encode: (val) => {
        if (typeof val === "string") return Principal.fromText(val)
        if (val instanceof Principal) return val
        throw new TypeError(
          `[ic-reactor] Cannot encode value as Principal: expected a string or Principal instance, got ${typeof val}`
        )
      },
    })
  }

  visitConstruct<T>(t: IDL.ConstructType<T>, data: unknown): z.ZodTypeAny {
    return t.accept(this, data)
  }

  visitVec<T>(
    _t: IDL.VecClass<T>,
    elemType: IDL.Type<T>,
    _data: unknown
  ): z.ZodTypeAny {
    // Special case: Vec<Nat8> is a Blob (Uint8Array ↔ hex string)
    if (elemType.name === "nat8") {
      return z.codec(
        z.union([z.instanceof(Uint8Array), z.array(z.number())]),
        // `number[]` belongs on the display side too: `DisplayOf` already types
        // a blob as `Uint8Array | number[] | string`, and a plain byte array is
        // what hand-written args and JSON round-trips produce. The byte bounds
        // are declared here so an out-of-range entry is reported with its
        // index instead of being silently wrapped by `Uint8Array.from`, which
        // turns `[-1, 256, 1.5]` into `[255, 0, 1]` — a different valid payload.
        z.union([
          z.string(),
          z.instanceof(Uint8Array),
          z.array(z.number().int().min(0).max(255)),
        ]),
        {
          decode: (val) => {
            if (!val) return val
            // One representation regardless of size. A 512-byte threshold
            // used to leave larger blobs as Uint8Array, so a single Candid
            // type produced two JS types depending on payload size —
            // sometimes within one record — and JSON-serialising a display
            // value corrupted exactly the large blobs
            // (JSON.stringify(Uint8Array) is an index-keyed object). Display
            // values are the JSON-safe layer; callers that need bytes back
            // have hexToUint8Array, and raw-candid Reactor never enters this
            // codec.
            return uint8ArrayToHex(val)
          },
          encode: (val) => {
            if (typeof val === "string") {
              return hexToUint8Array(val)
            }
            if (Array.isArray(val)) {
              return Uint8Array.from(val)
            }
            return val
          },
        }
      )
    }
    // Regular array: codec each element
    const elemCodec = elemType.accept(this, null)
    const decodeElem = decoderOf(elemCodec)
    const encodeElem = encoderOf(elemCodec)

    // Special case: Vec<Tuple(Text, Value)> → object keyed by the text.
    //
    // The key really must be `text`. This used to accept ANY 2-tuple, so a
    // `vec record { Account; nat }` — a real shape, e.g. the ckBTC ledger's
    // `InitArgs.initial_balances` — was run through `Object.fromEntries` and
    // every entry collapsed onto the single key "[object Object]", losing all
    // but the last. It also contradicted the declared type: `DisplayOf` maps to
    // `Record<string, …>` only for `Array<[string, B]>` and leaves any other
    // tuple vector as an array, so the runtime was returning an object where
    // the types promised a list.
    if (isTextKeyedPair(elemType)) {
      return passThroughCodec({
        decode: (val) => {
          if (!Array.isArray(val)) return val
          return Object.fromEntries(
            val.map((elem) => decodeElem(elem)) as [string, any][]
          )
        },
        encode: (val) => {
          // If already array, encode elements directly
          if (Array.isArray(val)) {
            return val.map((elem) => encodeElem(elem))
          }
          const entries =
            val && typeof val === "object" ? Object.entries(val) : val
          if (!Array.isArray(entries)) return entries
          return entries.map((elem) => encodeElem(elem))
        },
      })
    }

    return passThroughCodec({
      decode: (val) => {
        // `IDL.decode` returns a typed array, not an Array, for every
        // fixed-width integer vector except blob. `vec nat64` arrives as a
        // BigUint64Array and `vec int32` as an Int32Array. Checking only
        // `Array.isArray` let those through untransformed, so a `vec nat64`
        // result kept its bigints and the narrower ones stayed typed arrays,
        // which JSON-serialise as index-keyed objects.
        const elements = Array.isArray(val)
          ? val
          : ArrayBuffer.isView(val) && !(val instanceof DataView)
            ? Array.from(val as unknown as ArrayLike<unknown>)
            : undefined
        if (!elements) return val
        return elements.map((elem) => decodeElem(elem))
      },
      encode: (val) => {
        if (!Array.isArray(val)) return val
        return val.map((elem) => encodeElem(elem))
      },
    })
  }

  visitOpt<T>(
    _t: IDL.OptClass<T>,
    elemType: IDL.Type<T>,
    _data: unknown
  ): z.ZodTypeAny {
    const elemCodec = elemType.accept(this, null)
    const decodeElem = decoderOf(elemCodec)
    const encodeElem = encoderOf(elemCodec)

    // Only an element whose own values are arrays — a vector, a tuple, a
    // func reference, or an optional of one — can be confused with the Candid
    // optional wrapper, since both are arrays. Decide from the element TYPE
    // rather than by probing the codec: element codecs are built on `z.any()`
    // and pass unknown shapes straight through, so a probe reports success for
    // values the element cannot actually represent.
    const elemIsArrayValued = displaysAsArray(elemType)

    /**
     * Is `[inner]` the wrapper? Checking only that `inner` is an array is not
     * enough when the element's values are themselves arrays of arrays: a
     * `vec record { principal; nat }` holding one pair displays as
     * `[[p, n]]`, whose single element `[p, n]` is an array but not a vector
     * of pairs. So the wrapper reading is taken whenever `inner` could be an
     * element value, the long-standing preference when both readings fit
     * (`[[]]` is some(empty)), and otherwise the array is the value.
     */
    const isWrappedValue = (inner: unknown): boolean =>
      isOptionalWrapper(elemType, inner, elemIsArrayValued)

    return passThroughCodec({
      decode: (val) => {
        if (!Array.isArray(val) || val.length === 0) return undefined
        const value = decodeElem(val[0])
        // Only a nested optional decodes a some to `undefined` — its own
        // none. Left as is, `opt opt T`'s some(none) displayed exactly like
        // none, although canisters use them for different things (Internet
        // Identity's config: none keeps a setting, `opt null` clears it). It
        // displays as `null`, as `opt null`'s some(null) already does.
        // Encoding is unchanged: a nullish value is none.
        return value === undefined ? null : value
      },
      encode: (val) => {
        if (isNullish(val)) return [] as []

        // Also accept the canonical Candid optional forms — `[]` for none and
        // `[value]` for some — because that is exactly how generated `_SERVICE`
        // declarations type an `opt` field (`[] | [T]`), so writing them is the
        // natural thing to do and used to fail.
        if (Array.isArray(val)) {
          // `[]` is none at an optional position, per Candid. Some(empty vec)
          // is written `[[]]`, which the branch below handles.
          if (val.length === 0) return [] as []
          if (val.length === 1 && isWrappedValue(val[0])) {
            return [encodeElem(val[0])] as [any]
          }
          // Otherwise the array IS the value — e.g. `opt vec text` given
          // `["only"]`, a bare one-element vector.
        }

        return [encodeElem(val)] as [any]
      },
    })
  }

  visitRecord(
    _t: IDL.RecordClass,
    fields: Array<[string, IDL.Type]>,
    _data: unknown
  ): z.ZodTypeAny {
    const fieldEntries = fields.map(([fieldName, fieldType]) => {
      const codec = fieldType.accept(this, null)
      return { fieldName, decode: decoderOf(codec), encode: encoderOf(codec) }
    })

    return passThroughCodec({
      decode: (val) => {
        if (!val || typeof val !== "object") return val
        // A plain read is right here: IDL.decode sets every field of the
        // record it returns. (It assigns `x[key] = value`, so a `__proto__`
        // field lands on the prototype, where only this read still finds it.)
        return Object.fromEntries(
          fieldEntries.map(({ fieldName, decode }) => [
            fieldName,
            decode(val[fieldName]),
          ])
        )
      },
      encode: (val) => {
        if (!val || typeof val !== "object") return val
        return Object.fromEntries(
          fieldEntries.map(({ fieldName, encode }) => [
            fieldName,
            encode(labelValue(val, fieldName)),
          ])
        )
      },
    })
  }

  visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    _data: unknown
  ): z.ZodTypeAny {
    const componentCodecs = components.map((component) =>
      component.accept(this, null)
    )
    const decoders = componentCodecs.map(decoderOf)
    const encoders = componentCodecs.map(encoderOf)

    return passThroughCodec({
      decode: (val) => {
        if (!Array.isArray(val)) return val
        return val.map((elem: unknown, idx: number) => decoders[idx](elem))
      },
      encode: (val) => {
        if (!Array.isArray(val)) return val
        return val.map((elem: unknown, idx: number) => encoders[idx](elem))
      },
    })
  }

  visitVariant(
    _t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    _data: unknown
  ): z.ZodTypeAny {
    // No prototype: `key in decoders` must not find `toString` or
    // `constructor` for a variant that has no such arm.
    const decoders: Record<string, Transform> = Object.create(null)
    const encoders: Record<string, Transform> = Object.create(null)
    for (const [variantName, variantType] of fields) {
      const codec = variantType.accept(this, null)
      decoders[variantName] = decoderOf(codec)
      encoders[variantName] = encoderOf(codec)
    }

    // A missing payload is a value only when the arm's type is `opt T`,
    // directly or behind a recursive type, and Candid sends that none as `[]`.
    // Decoding `{ A: [] }` yields `{ _type: "A", A: undefined }`, and form
    // metadata defaults an optional payload to null, so for these arms a
    // nullish payload still goes through the arm's codec. Any other arm keeps
    // `{ A: null }`, which IDL.encode rejects by naming the arm.
    const isOptional = (type: IDL.Type | undefined): boolean =>
      type instanceof IDL.OptClass ||
      (type instanceof IDL.RecClass && isOptional(type.getType()))
    const encodesPayload = (type: IDL.Type | undefined, payload: unknown) =>
      nonNullish(payload) || isOptional(type)

    return passThroughCodec({
      decode: (val: any) => {
        if (
          !val ||
          typeof val !== "object" ||
          Array.isArray(val) ||
          val instanceof Principal ||
          "_type" in val
        ) {
          return val
        }

        const keys = Object.keys(val)
        if (keys.length !== 1) return val

        try {
          const extracted = createVariant(val)
          const key = extracted._type
          const fieldType = fields.find(([n]) => n === key)?.[1]
          if (fieldType?.name === "null") return { _type: key }

          const payload = labelValue(extracted, key)
          if (key in decoders && nonNullish(payload)) {
            return {
              _type: key,
              [key]: decoders[key](payload),
            }
          }
          return extracted
        } catch {
          return val
        }
      },
      encode: (val: any) => {
        if (
          !val ||
          typeof val !== "object" ||
          Array.isArray(val) ||
          val instanceof Principal
        ) {
          return val
        }

        // No try/catch here. A payload codec throws when the payload is
        // invalid, and returning the untransformed value instead skipped every
        // check it makes. IDL.encode then accepted what the float codec
        // refuses (NaN, Infinity, a float32 that overflows when narrowed) and
        // replaced every other codec error with a generic "Invalid variant".
        // transformArgsWithCodec wraps the error with the argument context.

        // Format 1: With _type property (from decode output)
        if ("_type" in val) {
          const key = val._type
          const fieldType = fields.find(([n]) => n === key)?.[1]
          if (fieldType?.name === "null") return { [key]: null }

          const payload = labelValue(val, key)
          if (key in encoders && encodesPayload(fieldType, payload)) {
            return { [key]: encoders[key](payload) }
          }
          return { [key]: null }
        }

        // Format 2: Without _type (direct variant format from forms: { Add: value })
        const keys = Object.keys(val)
        if (keys.length === 1) {
          const key = keys[0]
          const fieldType = fields.find(([n]) => n === key)?.[1]
          if (fieldType?.name === "null") return { [key]: null }

          if (key in encoders && encodesPayload(fieldType, val[key])) {
            return { [key]: encoders[key](val[key]) }
          }
          return { [key]: null }
        }

        // Unknown format - return as-is
        return val
      },
    })
  }

  visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: unknown
  ): z.ZodTypeAny {
    if (this._recCache.has(t)) return this._recCache.get(t)!

    // Built on first use rather than here, since `ty` refers back to `t` —
    // but built once. Rebuilding it on every call visited the whole type
    // and constructed fresh codecs for each node of a recursive value, which
    // made a page of ICRC-3 blocks an order of magnitude slower to display
    // than to decode.
    let inner: Transforms | undefined
    const innerTransforms = (): Transforms => {
      if (!inner) {
        const codec = ty.accept(this, data)
        inner = { decode: decoderOf(codec), encode: encoderOf(codec) }
      }
      return inner
    }

    const lazyCodec = passThroughCodec({
      decode: (val: any) => innerTransforms().decode(val),
      encode: (val: any) => innerTransforms().encode(val),
    })

    this._recCache.set(t, lazyCodec)
    return lazyCodec
  }

  visitFunc(_t: IDL.FuncClass, _data: unknown): z.ZodTypeAny {
    return passThroughCodec({
      decode: (val: any) => {
        if (!Array.isArray(val) || val.length !== 2) return val
        const [principal, method] = val
        return [
          principal instanceof Principal ? principal.toText() : principal,
          method,
        ]
      },
      encode: (val: any) => {
        if (!Array.isArray(val) || val.length !== 2) return val
        const [principalStr, method] = val
        return [
          typeof principalStr === "string"
            ? Principal.fromText(principalStr)
            : principalStr,
          method,
        ]
      },
    })
  }

  visitService(_t: IDL.ServiceClass, _data: unknown): z.ZodTypeAny {
    return passThroughCodec({
      decode: (val) => (val instanceof Principal ? val.toText() : val),
      encode: (val) =>
        typeof val === "string" ? Principal.fromText(val) : val,
    })
  }
}
