import * as z from "zod"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import {
  createVariant,
  nonNullish,
  uint8ArrayToHex,
  hexToUint8Array,
  isNullish,
} from "../utils"

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

  visitFloat(_t: IDL.FloatClass, _data: unknown): z.ZodTypeAny {
    return z.number()
  }

  visitFixedInt(t: IDL.FixedIntClass, _data: unknown): z.ZodTypeAny {
    const bits = t._bits

    if (bits <= 32) {
      // 32-bit integers stay as numbers
      return z.number()
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
      return z.number()
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
        return String(val)
      },
      encode: (val) => {
        if (typeof val === "string") return Principal.fromText(val)
        if (val instanceof Principal) return val
        return Principal.fromText(String(val))
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
        z.union([z.string(), z.instanceof(Uint8Array)]),
        {
          decode: (val) => {
            if (!val) return val
            if (val.length <= 512) return uint8ArrayToHex(val)
            return val as Uint8Array<ArrayBuffer>
          },
          encode: (val) => {
            if (typeof val === "string") {
              return hexToUint8Array(val)
            }
            return val
          },
        }
      )
    }
    // Regular array: codec each element
    const elemCodec = elemType.accept(this, null)

    // Special case: Vec<Tuple(Text, Value)> → Map (for key-value pairs)
    const isTextTuple =
      elemType instanceof IDL.TupleClass && elemType._fields.length === 2

    if (isTextTuple) {
      return z.codec(z.any(), z.any(), {
        decode: (val) => {
          if (!Array.isArray(val)) return val
          return new Map(
            val.map((elem) => elemCodec.decode(elem)) as [string, string][]
          )
        },
        encode: (val) => {
          const entries = val instanceof Map ? Array.from(val.entries()) : val
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

    return z.codec(z.any(), z.any(), {
      decode: (val) => {
        if (!Array.isArray(val) || val.length === 0) return undefined
        return elemCodec.decode(val[0])
      },
      encode: (val) => {
        if (isNullish(val)) return [] as []
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
          val instanceof Principal ||
          !("_type" in val)
        ) {
          return val
        }

        try {
          const key = val._type
          const fieldType = fields.find(([n]) => n === key)?.[1]
          if (fieldType?.name === "null") return { [key]: null }

          if (key in variantCodecs && nonNullish(val[key])) {
            return { [key]: encode(variantCodecs[key], val[key]) }
          }
          return { [key]: null }
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
