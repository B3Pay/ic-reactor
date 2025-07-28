import { Principal } from "@dfinity/principal"
import { IDL } from "@dfinity/candid"

import type { BaseActor, MethodRetsDefaultValues } from "../types"
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
export class VisitRandomRets<A = BaseActor> extends IDL.Visitor<
  unknown,
  MethodRetsDefaultValues<A> | unknown
> {
  private inVisit = false

  public visitFunc(t: IDL.FuncClass): MethodRetsDefaultValues<A> {
    if (this.inVisit) {
      const canisterId = Principal.fromUint8Array(generateRandomBytes(10))
      const functionName = Math.random().toString(36).substring(6)

      return [canisterId, functionName] as unknown as MethodRetsDefaultValues<A>
    }

    const defaultValue = t.retTypes.reduce<Record<string, unknown>>(
      (acc, type, index) => {
        this.inVisit = true
        acc[`ret${index}`] = type.accept(this, false)
        this.inVisit = false
        return acc
      },
      {}
    )

    return defaultValue as MethodRetsDefaultValues<A>
  }

  public visitRecord(
    _t: IDL.RecordClass,
    fields: [string, IDL.Type][],
    isRecursive: boolean
  ): unknown {
    return fields.reduce((acc, [key, type]) => {
      acc[key] = type.accept(this, isRecursive)
      return acc
    }, {} as Record<string, unknown>)
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields: [string, IDL.Type][],
    isRecursive: boolean
  ): unknown {
    const [key, type] = fields[Math.floor(Math.random() * fields.length)]
    const result = { [key]: type.accept(this, isRecursive) }

    return result
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    type: IDL.Type,
    isRecursive: boolean
  ): unknown {
    if (isRecursive) {
      const recType = type.accept(this, isRecursive)
      return [recType]
    }

    const length = Math.floor(Math.random() * 5)

    return Array.from({ length }, () => type.accept(this, isRecursive))
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    type: IDL.Type,
    isRecursive: boolean
  ): unknown {
    if (Math.random() < 0.5) {
      return []
    } else {
      return [type.accept(this, isRecursive)]
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    isRecursive: boolean
  ): unknown {
    return components.map((type) => type.accept(this, isRecursive))
  }

  private savedRec: Record<string, unknown> = {}

  public visitRec<T>(_t: IDL.RecClass<T>, ty: IDL.ConstructType<T>) {
    if (!this.savedRec[ty.name]) {
      this.savedRec[ty.name] = ty.accept(this, true)
    }

    return this.savedRec[ty.name]
  }

  public visitType<T>(_t: IDL.Type<T>) {
    return Math.random().toString(36).substring(6)
  }

  public visitPrincipal(_t: IDL.PrincipalClass) {
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
