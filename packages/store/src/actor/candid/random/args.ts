import { Principal } from "@dfinity/principal"
import { IDL } from "@dfinity/candid"
import { FunctionName } from "../types"

export class ExtractRandomArgs extends IDL.Visitor<any, any> {
  public generate(t: IDL.Type[], functionName: FunctionName): any {
    const defaultValue = t.reduce((acc, type, index) => {
      acc[`arg${index}`] = type.accept(this, null)

      return acc
    }, {} as any)

    const defaultValues = {
      [functionName]: defaultValue,
    }

    return defaultValues
  }

  public visitRecord(
    _t: IDL.RecordClass,
    fields: [string, IDL.Type<any>][]
  ): { [key: string]: any } {
    return fields.reduce((acc, [key, type]) => {
      acc[key] = type.accept(this, null)
      return acc
    }, {} as { [key: string]: any })
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields: [string, IDL.Type<any>][]
  ): { [key: string]: any } {
    const [key, type] = fields[Math.floor(Math.random() * fields.length)]
    return { [key]: type.accept(this, null) }
  }

  public visitVec<T>(_t: IDL.VecClass<T>, type: IDL.Type<any>): any[] {
    const length = Math.floor(Math.random() * 10)
    return Array.from({ length }, () => type.accept(this, null))
  }

  public visitOpt<T>(_t: IDL.OptClass<T>, type: IDL.Type<any>): any | null {
    if (Math.random() < 0.5) {
      return []
    } else {
      return [type.accept(this, null)]
    }
  }

  public visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type<any>[]
  ): any[] {
    return components.map((type) => type.accept(this, null))
  }

  private savedRec: Record<string, any[]> = {}

  public visitRec<T>(_t: IDL.RecClass<T>, ty: IDL.ConstructType<T>): any {
    if (!this.savedRec[ty.name]) {
      this.savedRec[ty.name] = ty.accept(this, null)
    }

    return this.savedRec[ty.name]
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
    const max = BigInt(2) << BigInt(bits - 2) // Adjust for signedness?
    const min = isSigned ? -max : BigInt(0) // Calculate min for signed types

    let randomBigInt = BigInt(0)
    const maxIterations = 1000 // Set a maximum number of iterations
    for (let i = 0; i < maxIterations; i++) {
      const randomBytes = this.generateRandomBytes(Math.ceil(bits / 8))
      const mask = (BigInt(1) << BigInt(bits)) - BigInt(1)
      randomBigInt = BigInt(`0x${this.bytesToHex(randomBytes)}`) & mask
      if (randomBigInt >= min && randomBigInt < max) {
        break // Exit loop if valid value found
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

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  }

  private generateRandomBytes(n: number): Uint8Array {
    const arr = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
    return arr
  }
}
