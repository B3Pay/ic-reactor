import { Principal } from "@dfinity/principal"
import { IDL } from "@dfinity/candid"

import type {
  BaseActor,
  MethodRetsDefaultValues,
  ReturnTypeFromIDLType,
} from "../types"

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
      const canisterId = Principal.fromUint8Array(this.generateRandomBytes(10))
      const functionName = Math.random().toString(36).substring(6)

      return [canisterId, functionName] as unknown as MethodRetsDefaultValues<A>
    }

    const defaultValue = t.retTypes.reduce((acc, type, index) => {
      this.inVisit = true
      acc[`ret${index}`] = type.accept(this, false) as ReturnTypeFromIDLType<
        typeof type
      >
      this.inVisit = false
      return acc
    }, {} as MethodRetsDefaultValues<A>)

    return defaultValue
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
    return Principal.fromUint8Array(this.generateRandomBytes(29))
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
    return this.generateNumber(true)
  }

  public visitNat(_t: IDL.NatClass): number {
    return this.generateNumber(false)
  }

  public visitFixedInt(t: IDL.FixedIntClass): number | bigint {
    if (t._bits <= 32) {
      return this.generateNumber(true)
    } else {
      return this.generateBigInteger(t._bits, true)
    }
  }

  public visitFixedNat(t: IDL.FixedNatClass): number | bigint {
    if (t._bits <= 32) {
      return this.generateNumber(false)
    } else {
      return this.generateBigInteger(t._bits, false)
    }
  }

  private generateNumber(isSigned: boolean): number {
    const num = Math.floor(Math.random() * 100)
    if (isSigned && Math.random() < 0.5) {
      return -num
    } else {
      return num
    }
  }

  private generateBigInteger(bits: number, isSigned: boolean): bigint {
    const max = BigInt(2) << BigInt(bits - 2)
    const min = isSigned ? -max : BigInt(0)

    let randomBigInt = BigInt(0)
    const maxIterations = 1000
    for (let i = 0; i < maxIterations; i++) {
      const randomBytes = this.generateRandomBytes(Math.ceil(bits / 8))
      const mask = (BigInt(1) << BigInt(bits)) - BigInt(1)
      randomBigInt = BigInt(this.bytesToBase64(randomBytes)) & mask
      if (randomBigInt >= min && randomBigInt < max) {
        break
      }
    }

    if (randomBigInt >= max || randomBigInt < min) {
      throw new Error(
        `Failed to generate BigInt within valid range for ${bits}-bit ${
          isSigned ? "signed" : "unsigned"
        } FixedInt`
      )
    }

    return randomBigInt
  }

  private bytesToBase64(bytes: Uint8Array): string {
    return `0x${Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`
  }

  private generateRandomBytes(n: number): Uint8Array {
    const arr = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      arr[i] = Math.floor(Math.random() * 128)
    }
    return arr
  }
}
