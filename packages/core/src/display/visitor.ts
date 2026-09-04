import * as z from "zod"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import {
  createVariant,
  nonNullish,
  uint8ArrayToHex,
  hexToUint8Array,
  isNullish,
} from "../utils/index.js"

function createFixedNumberCodec(bits: number, signed: boolean): z.ZodTypeAny {
  const min = signed ? -(2 ** (bits - 1)) : 0
  const max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1
  const integerPattern = signed ? /^-?\d+$/ : /^\d+$/
  const typeName = `${signed ? "int" : "nat"}${bits}`

  const parseDisplayNumber = (val: string | number): number => {
    const num = typeof val === "string" ? Number(val) : val

    if (typeof val === "string" && !integerPattern.test(val)) {
      throw new TypeError(
        `[ic-reactor] Invalid ${typeName} display value: expected an integer string, got "${val}"`
      )
    }

    if (!Number.isInteger(num)) {
      throw new TypeError(
        `[ic-reactor] Invalid ${typeName} display value: expected an integer, got ${String(val)}`
      )
    }

    if (num < min || num > max) {
      throw new RangeError(
        `[ic-reactor] Invalid ${typeName} display value: expected ${min}..${max}, got ${String(val)}`
      )
    }

    return num
  }

  return z.codec(
    z.number().int().min(min).max(max), // Candid format
    z.union([z.number(), z.string()]), // Display format
    {
      decode: (val) => val,
      encode: parseDisplayNumber,
    }
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
    return z.codec(
      z.bigint(), // Candid format
      z.string(), // Display format
      {
        decode: (val) => (typeof val === "bigint" ? val.toString() : val),
        encode: (val) => (typeof val === "string" ? BigInt(val) : val),
      }
    )
  }

  visitNat(_t: IDL.NatClass, _data: unknown): z.ZodTypeAny {
    return z.codec(
      z.bigint(), // Candid format
      z.string(), // Display format
      {
        decode: (val) => (typeof val === "bigint" ? val.toString() : val),
        encode: (val) => (typeof val === "string" ? BigInt(val) : val),
      }
    )
  }

  visitFloat(t: IDL.FloatClass, _data: unknown): z.ZodTypeAny {
    // Floats display as numbers, but form metadata holds every numeric field
    // as a string (the visitors in @ic-reactor/candid emit "" and a string
    // schema for float32/float64), so a value that passed the form's own
    // validation must encode here too. Same contract as the ≤32-bit integers.
    const typeName = `float${t._bits}`
    return z.codec(
      z.number(), // Candid format
      z.union([z.number(), z.string()]), // Display format
      {
        decode: (val) => val,
        encode: (val) => {
          const num = typeof val === "string" ? Number(val.trim()) : val
          if (typeof val === "string" && val.trim() === "") {
            throw new TypeError(
              `[ic-reactor] Invalid ${typeName} display value: expected a number, got ""`
            )
          }
          // A finite double can still overflow float32: IDL.encode narrows
          // 3.4028236e38 to Infinity and sends that, so check the narrowed
          // value for float32, not just the double.
          const narrowed = t._bits === 32 ? Math.fround(num) : num
          if (!Number.isFinite(narrowed)) {
            throw new TypeError(
              `[ic-reactor] Invalid ${typeName} display value: expected a finite ${typeName}, got ${String(val)}`
            )
          }
          return num
        },
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
      return z.codec(
        z.bigint(), // Candid format
        z.string(), // Display format
        {
          decode: (val) => (typeof val === "bigint" ? val.toString() : val),
          encode: (val) => (typeof val === "string" ? BigInt(val) : val),
        }
      )
    }
  }

  visitFixedNat(t: IDL.FixedNatClass, _data: unknown): z.ZodTypeAny {
    const bits = t._bits

    if (bits <= 32) {
      return createFixedNumberCodec(bits, false)
    } else {
      return z.codec(
        z.bigint(), // Candid format
        z.string(), // Display format
        {
          decode: (val) => (typeof val === "bigint" ? val.toString() : val),
          encode: (val) => (typeof val === "string" ? BigInt(val) : val),
        }
      )
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
    const tupleFields =
      elemType instanceof IDL.TupleClass ? elemType._fields : undefined
    const isTextTuple =
      tupleFields?.length === 2 && tupleFields[0][1].name === "text"

    if (isTextTuple) {
      return z.codec(z.any(), z.any(), {
        decode: (val) => {
          if (!Array.isArray(val)) return val
          return Object.fromEntries(
            val.map((elem) => elemCodec.decode(elem)) as [string, any][]
          )
        },
        encode: (val) => {
          // If already array, encode elements directly
          if (Array.isArray(val)) {
            return val.map((elem) => elemCodec.encode(elem))
          }
          const entries =
            val && typeof val === "object" ? Object.entries(val) : val
          if (!Array.isArray(entries)) return entries
          return entries.map((elem) => elemCodec.encode(elem))
        },
      })
    }

    return z.codec(z.any(), z.any(), {
      decode: (val) => {
        if (!Array.isArray(val)) return val
        return val.map((elem) => elemCodec.decode(elem))
      },
      encode: (val) => {
        if (!Array.isArray(val)) return val
        return val.map((elem) => elemCodec.encode(elem))
      },
    })
  }

  visitOpt<T>(
    _t: IDL.OptClass<T>,
    elemType: IDL.Type<T>,
    _data: unknown
  ): z.ZodTypeAny {
    const elemCodec = elemType.accept(this, null)

    // Only a vector-valued element can be confused with the Candid optional
    // wrapper, since both are arrays. Decide from the element TYPE rather than
    // by probing the codec: element codecs are built on `z.any()` and pass
    // unknown shapes straight through, so a probe reports success for values
    // the element cannot actually represent.
    const elemIsVec = elemType.name.startsWith("vec ")
    const elemIsBlob = elemType.name === "vec nat8"

    /** Is `inner` a plausible value for the element type, i.e. is `[inner]` a wrapper? */
    const isWrappedValue = (inner: unknown): boolean => {
      if (!elemIsVec) return true // non-vector element: `[v]` is unambiguous
      if (Array.isArray(inner)) return true
      // A blob also accepts its scalar display forms.
      return (
        elemIsBlob && (inner instanceof Uint8Array || typeof inner === "string")
      )
    }

    return z.codec(z.any(), z.any(), {
      decode: (val) => {
        if (!Array.isArray(val) || val.length === 0) return undefined
        return elemCodec.decode(val[0])
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
            return [elemCodec.encode(val[0])] as [any]
          }
          // Otherwise the array IS the value — e.g. `opt vec text` given
          // `["only"]`, a bare one-element vector.
        }

        return [elemCodec.encode(val)] as [any]
      },
    })
  }

  visitRecord(
    _t: IDL.RecordClass,
    fields: Array<[string, IDL.Type]>,
    _data: unknown
  ): z.ZodTypeAny {
    const fieldEntries = fields.map(([fieldName, fieldType]) => ({
      fieldName,
      codec: fieldType.accept(this, null),
    }))

    return z.codec(z.any(), z.any(), {
      decode: (val) => {
        if (!val || typeof val !== "object") return val
        return Object.fromEntries(
          fieldEntries.map(({ fieldName, codec }) => [
            fieldName,
            codec.decode(val[fieldName]),
          ])
        )
      },
      encode: (val) => {
        if (!val || typeof val !== "object") return val
        return Object.fromEntries(
          fieldEntries.map(({ fieldName, codec }) => [
            fieldName,
            codec.encode(val[fieldName]),
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
    const componentCodecs: any = components.map((component) =>
      component.accept(this, null)
    )

    return z.codec(z.any(), z.any(), {
      decode: (val) => {
        if (!Array.isArray(val)) return val
        return val.map((elem: any, idx: number) =>
          componentCodecs[idx].decode(elem)
        )
      },
      encode: (val) => {
        if (!Array.isArray(val)) return val
        return val.map((elem: any, idx: number) =>
          componentCodecs[idx].encode(elem)
        )
      },
    })
  }

  visitVariant(
    _t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    _data: unknown
  ): z.ZodTypeAny {
    const variantCodecs: Record<string, any> = {}
    for (const [variantName, variantType] of fields) {
      variantCodecs[variantName] = variantType.accept(this, null)
    }

    const decode = (codec: any, val: any) =>
      codec.decode ? codec.decode(val) : val
    const encode = (codec: any, val: any) =>
      codec.encode ? codec.encode(val) : val

    return z.codec(z.any(), z.any(), {
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

          if (key in variantCodecs && nonNullish(extracted[key])) {
            return {
              _type: key,
              [key]: decode(variantCodecs[key], extracted[key]),
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

        try {
          // Format 1: With _type property (from decode output)
          if ("_type" in val) {
            const key = val._type
            const fieldType = fields.find(([n]) => n === key)?.[1]
            if (fieldType?.name === "null") return { [key]: null }

            if (key in variantCodecs && nonNullish(val[key])) {
              return { [key]: encode(variantCodecs[key], val[key]) }
            }
            return { [key]: null }
          }

          // Format 2: Without _type (direct variant format from forms: { Add: value })
          const keys = Object.keys(val)
          if (keys.length === 1) {
            const key = keys[0]
            const fieldType = fields.find(([n]) => n === key)?.[1]
            if (fieldType?.name === "null") return { [key]: null }

            if (key in variantCodecs && nonNullish(val[key])) {
              return { [key]: encode(variantCodecs[key], val[key]) }
            }
            return { [key]: null }
          }

          // Unknown format - return as-is
          return val
        } catch {
          return val
        }
      },
    })
  }

  visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: unknown
  ): z.ZodTypeAny {
    if (this._recCache.has(t)) return this._recCache.get(t)!

    const lazyCodec = z.codec(z.any(), z.any(), {
      decode: (val: any) => {
        const codec = ty.accept(this, data)
        return codec.decode ? codec.decode(val) : val
      },
      encode: (val: any) => {
        const codec = ty.accept(this, data)
        return codec.encode ? codec.encode(val) : val
      },
    })

    this._recCache.set(t, lazyCodec)
    return lazyCodec
  }

  visitFunc(_t: IDL.FuncClass, _data: unknown): z.ZodTypeAny {
    return z.codec(z.any(), z.any(), {
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
    return z.codec(z.any(), z.any(), {
      decode: (val) => (val instanceof Principal ? val.toText() : val),
      encode: (val) =>
        typeof val === "string" ? Principal.fromText(val) : val,
    })
  }
}
