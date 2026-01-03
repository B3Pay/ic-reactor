import * as z from "zod"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { hexToUint8Array, uint8ArrayToHex } from "../utils/helper"
import { isNullish, nonNullish } from "../utils/helper"
import { createVariant } from "../utils"

export class DisplayCodecVisitor extends IDL.Visitor<unknown, z.ZodTypeAny> {
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
            if (val.length <= 96) return uint8ArrayToHex(val)
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
    // Extract input/output schemas from the nested codec
    const candidElemSchema =
      elemCodec instanceof z.ZodCodec ? elemCodec.in : elemCodec
    const displayElemSchema =
      elemCodec instanceof z.ZodCodec ? elemCodec.out : elemCodec

    // Special case: Vec<Tuple(Text, Value)> → Map (for key-value pairs)
    const isTextTuple =
      elemType instanceof IDL.TupleClass && elemType._fields.length === 2

    if (isTextTuple) {
      return z.codec(
        z.array(candidElemSchema),
        z.union([z.array(displayElemSchema), z.instanceof(Map)]),
        {
          decode: (val) =>
            new Map(
              val.map((elem) => elemCodec.decode(elem)) as [string, string][]
            ),
          encode: (val) => {
            const entries = val instanceof Map ? Array.from(val.entries()) : val
            return entries.map((elem) => elemCodec.encode(elem))
          },
        }
      )
    }

    return z.codec(z.array(candidElemSchema), z.array(displayElemSchema), {
      decode: (val) => val.map((elem) => elemCodec.decode(elem)),
      encode: (val) => val.map((elem) => elemCodec.encode(elem)),
    })
  }

  visitOpt<T>(
    _t: IDL.OptClass<T>,
    elemType: IDL.Type<T>,
    _data: unknown
  ): z.ZodTypeAny {
    const elemCodec = elemType.accept(this, null)

    // Extract input/output schemas from the nested codec
    const candidElemSchema =
      elemCodec instanceof z.ZodCodec ? elemCodec.in : elemCodec
    const displayElemSchema =
      elemCodec instanceof z.ZodCodec ? elemCodec.out : elemCodec

    return z.codec(
      z.union([z.tuple([]), z.tuple([candidElemSchema])]),
      z.nullish(displayElemSchema),
      {
        decode: (val) => {
          if (!Array.isArray(val) || val.length === 0) return undefined
          return elemCodec.decode(val[0])
        },
        encode: (val) => {
          if (isNullish(val)) return [] as []
          return [elemCodec.encode(val)] as [any]
        },
      }
    )
  }

  visitRecord(
    _t: IDL.RecordClass,
    fields: Array<[string, IDL.Type]>,
    _data: unknown
  ): z.ZodTypeAny {
    // Build field entries with codecs and schemas in one pass using fields
    const fieldEntries = fields.map(([fieldName, fieldType]) => {
      const codec = fieldType.accept(this, null) as z.ZodCodec<any, any>
      return {
        fieldName,
        codec,
        candidSchema: codec.in || codec,
        displaySchema: codec.out || codec,
      }
    })

    // Construct shapes directly from fieldEntries
    const candidShape = Object.fromEntries(
      fieldEntries.map(({ fieldName, candidSchema }) => [
        fieldName,
        candidSchema,
      ])
    )
    const displayShape = Object.fromEntries(
      fieldEntries.map(({ fieldName, displaySchema }) => [
        fieldName,
        displaySchema,
      ])
    )

    return z.codec(z.object(candidShape), z.object(displayShape), {
      decode: (val) =>
        Object.fromEntries(
          fieldEntries.map(({ fieldName, codec }) => [
            fieldName,
            codec.decode(val[fieldName]),
          ])
        ),
      encode: (val) =>
        Object.fromEntries(
          fieldEntries.map(({ fieldName, codec }) => [
            fieldName,
            codec.encode(val[fieldName]),
          ])
        ),
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

    if (componentCodecs.length === 0) {
      return z.tuple([])
    }

    // Extract input/output schemas from nested codecs
    const candidComponents = componentCodecs.map(
      (codec: any) => codec.in || codec
    )
    const displayComponents = componentCodecs.map(
      (codec: any) => codec.out || codec
    )

    return z.codec(z.tuple(candidComponents), z.tuple(displayComponents), {
      decode: (val) =>
        val.map((elem: any, idx: number) => componentCodecs[idx].decode(elem)),
      encode: (val) =>
        val.map((elem: any, idx: number) => componentCodecs[idx].encode(elem)),
    })
  }

  visitVariant(
    _t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    _data: unknown
  ): z.ZodTypeAny {
    // Build codecs for variant values
    const variantCodecs: Record<string, z.ZodTypeAny> = {}
    for (const [variantName, variantType] of fields) {
      variantCodecs[variantName] = variantType.accept(this, null)
    }

    // Extract input/output schemas from variant codecs
    const candidSchemas: Record<string, z.ZodTypeAny> = {}
    const displaySchemas: Record<string, z.ZodTypeAny> = {}
    for (const [variantName, codec] of Object.entries(variantCodecs)) {
      const codecAny = codec as any
      candidSchemas[variantName] = codecAny.in || codec
      displaySchemas[variantName] = codecAny.out || codec
    }

    // Build Candid variant schemas (union of { Key: value })
    const candidVariants = fields.map(([variantName, _variantType]) =>
      z.object({ [variantName]: candidSchemas[variantName] })
    )

    // Build Display variant schemas (union of { _type: "Key", Key?: value })
    const displayVariants = fields.map(([variantName, variantType]) => {
      const isNullVariant = variantType.name === "null"
      if (isNullVariant) {
        return z.object({ _type: z.literal(variantName) })
      } else {
        return z.object({
          _type: z.literal(variantName),
          [variantName]: displaySchemas[variantName],
        })
      }
    })

    const candidSchema =
      candidVariants.length === 1
        ? candidVariants[0]
        : z.union([
            candidVariants[0],
            candidVariants[1],
            ...candidVariants.slice(2),
          ])

    const displaySchema =
      displayVariants.length === 1
        ? displayVariants[0]
        : z.union([
            displayVariants[0],
            displayVariants[1],
            ...displayVariants.slice(2),
          ])

    return z.codec(candidSchema, displaySchema, {
      decode: (val: any) => {
        if (typeof val !== "object" || val === null || Array.isArray(val))
          return val

        const extracted = createVariant(val)
        const key = extracted._type

        // Apply codec transformation if variant has a value
        if (
          key in extracted &&
          nonNullish(extracted[key]) &&
          key in variantCodecs
        ) {
          return {
            ...extracted,
            [key]: variantCodecs[key].decode(extracted[key]),
          }
        }

        return extracted
      },
      encode: (val: any) => {
        if (typeof val !== "object" || val === null || !("_type" in val))
          return val

        const key = val._type

        // Check if there's a value associated with this variant
        if (key in val && nonNullish(val[key]) && key in variantCodecs) {
          return { [key]: variantCodecs[key].encode(val[key]) }
        }

        // Null variant
        return { [key]: null }
      },
    })
  }

  visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: unknown
  ): z.ZodTypeAny {
    // For recursive types, we create a lazy codec
    return z.lazy(() => ty.accept(this, data))
  }

  visitFunc(_t: IDL.FuncClass, _data: unknown): z.ZodTypeAny {
    const principalSchema = z.custom<Principal>(
      (val) => val instanceof Principal,
      {
        message: "Expected Principal instance",
      }
    )

    return z.codec(
      z.tuple([principalSchema, z.string()]),
      z.tuple([z.string(), z.string()]),
      {
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
      }
    )
  }

  visitService(_t: IDL.ServiceClass, _data: unknown): z.ZodTypeAny {
    return z.codec(
      z.custom<Principal>((val) => val instanceof Principal, {
        message: "Expected Principal instance",
      }),
      z.string(),
      {
        decode: (val) => (val instanceof Principal ? val.toText() : val),
        encode: (val) =>
          typeof val === "string" ? Principal.fromText(val) : val,
      }
    )
  }
}
