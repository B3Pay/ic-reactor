import { Principal } from "@dfinity/principal"
import { IDL } from "@dfinity/candid"

import type {
  BaseActor,
  ArgTypeFromIDLType,
  MethodArgsDefaultValues,
} from "../types"
import {
  generateBigInteger,
  generateNumber,
  generateRandomBytes,
} from "./helper"

/**
 * Visit the candid file and extract the fields.
 * It returns the extracted service fields.
 *
 */
export class VisitRandomArgs<A = BaseActor> extends IDL.Visitor<
  unknown,
  unknown
> {
  public visitFunc(t: IDL.FuncClass) {
    const defaultValue = t.argTypes.reduce((acc, type, index) => {
      acc[`arg${index}`] = type.accept(this, false) as ArgTypeFromIDLType<
        typeof type
      >

      return acc
    }, {} as MethodArgsDefaultValues<A>)

    return defaultValue
  }

  public visitRecord(
    _t: IDL.RecordClass,
    fields: [string, IDL.Type<unknown>][],
    isRecursive: boolean
  ): unknown {
    const result: { [key: string]: unknown } = {}

    fields.forEach(([key, type]) => {
      result[key] = type.accept(this, isRecursive)
    })

    return result
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields: [string, IDL.Type<unknown>][],
    isRecursive: boolean
  ): unknown {
    const [key, type] = fields[Math.floor(Math.random() * fields.length)]
    const result = { [key]: type.accept(this, isRecursive) }

    return result
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    type: IDL.Type<unknown>,
    isRecursive: boolean
  ): unknown {
    if (isRecursive) {
      const recType = type.accept(this, isRecursive)
      return [recType]
    }

    if ("_bits" in type && type._bits === 8) {
      return Array.from(generateRandomBytes(32))
    }

    const length = Math.floor(Math.random() * 5)

    return Array.from({ length }, () => type.accept(this, isRecursive))
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    type: IDL.Type<unknown>,
    isRecursive: boolean
  ): unknown {
    if (Math.random() < 0.5) {
      return []
    } else {
      return [type.accept(this, isRecursive)]
    }
  }

  public visitTuple<T extends unknown[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type<unknown>[],
    isRecursive: boolean
  ): unknown {
    return components.map((type) => type.accept(this, isRecursive))
  }

  private savedRec: Record<string, unknown> = {}

  public visitRec<T>(_t: IDL.RecClass<T>, ty: IDL.ConstructType<T>): unknown {
    if (!this.savedRec[ty.name]) {
      this.savedRec[ty.name] = ty.accept(this, true)
    }

    return this.savedRec[ty.name]
  }

  public visitPrincipal(_t: IDL.PrincipalClass): unknown {
    return Principal.fromUint8Array(generateRandomBytes(29))
  }

  public visitNull(_t: IDL.NullClass): null {
    return null
  }

  public visitBool(_t: IDL.BoolClass): boolean {
    return Math.random() < 0.5
  }

  public visitText(_t: IDL.TextClass): string {
    return Math.random().toString(36).substring(6)
  }

  public visitFloat(_t: IDL.FloatClass): number {
    return Math.random()
  }

  public visitInt(_t: IDL.IntClass): number {
    return generateNumber(true)
  }

  public visitNat(_t: IDL.NatClass): number {
    return generateNumber(false)
  }

  public visitFixedInt(t: IDL.FixedIntClass): number | bigint {
    if (t._bits <= 32) {
      return generateNumber(true)
    } else {
      return generateBigInteger(t._bits, true)
    }
  }

  public visitFixedNat(t: IDL.FixedNatClass): number | bigint {
    if (t._bits <= 32) {
      return generateNumber(false)
    } else {
      return generateBigInteger(t._bits, false)
    }
  }
}
