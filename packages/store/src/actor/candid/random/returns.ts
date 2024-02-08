import { Principal } from "@dfinity/principal"
import { IDL } from "@dfinity/candid"
import { FunctionName } from "../types"

export class ExtractRandomReturns extends IDL.Visitor<any, any> {
  public generate(t: IDL.Type[], functionName: FunctionName): any {
    const defaultValue = t.reduce((acc, arg, index) => {
      acc[`arg${index}`] = arg.accept(this, null)

      return acc
    }, {} as any)

    const defaultValues = {
      [functionName]: defaultValue,
    }

    return defaultValues
  }

  public visitRecord(
    _t: IDL.RecordClass,
    fields: [string, IDL.Type<any>][],
    data: string
  ): { [key: string]: any } {
    return fields.reduce((acc, [key, type]) => {
      acc[key] = type.accept(this, data)
      return acc
    }, {} as { [key: string]: any })
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields: [string, IDL.Type<any>][],
    data: string
  ): { [key: string]: any } {
    const [key, type] = fields[Math.floor(Math.random() * fields.length)]
    return { [key]: type.accept(this, data) }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    type: IDL.Type<any>,
    data: string
  ): any[] {
    const length = Math.floor(Math.random() * 10)
    return Array.from({ length }, () => type.accept(this, data))
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    type: IDL.Type<any>,
    data: string
  ): any | null {
    if (Math.random() < 0.5) {
      return null
    } else {
      return [type.accept(this, data)]
    }
  }

  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: boolean
  ): any {
    return data ? null : ty.accept(this, true)
  }

  public visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type<any>[],
    data: string
  ): any[] {
    return components.map((type) => type.accept(this, data))
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
  public visitInt(_t: IDL.IntClass): bigint {
    return BigInt(this.generateNumber(true))
  }
  public visitNat(_t: IDL.NatClass): bigint {
    return BigInt(this.generateNumber(false))
  }
  public visitFixedInt(t: IDL.FixedIntClass): number | bigint {
    if (t._bits <= 32) {
      return this.generateNumber(true)
    } else {
      return this.generateBigInteger(t._bits)
    }
  }
  public visitFixedNat(t: IDL.FixedNatClass): number | bigint {
    if (t._bits <= 32) {
      return this.generateNumber(false)
    } else {
      return this.generateBigInteger(t._bits)
    }
  }

  private generateNumber(signed: boolean): number {
    const num = Math.floor(Math.random() * 100)
    if (signed && Math.random() < 0.5) {
      return -num
    } else {
      return num
    }
  }

  private generateBigInteger(bits: number): bigint {
    // Calculate the max value using left-shift and subtraction with BigInt operations
    const max = (BigInt(2) << BigInt(bits - 1)) - BigInt(1)

    // Calculate min value by negating the max and subtracting 1
    const min = -max - BigInt(1)

    // Generate random number within the valid range
    let randomBigInt = BigInt(0)
    do {
      // Use crypto for random bytes, convert to BigInt, and apply mask
      const randomBytes = this.generateRandomBytes(Math.ceil(bits / 8))
      const mask = (BigInt(1) << BigInt(bits)) - BigInt(1)
      randomBigInt =
        BigInt(`0x${Buffer.from(randomBytes).toString("hex")}`) & mask
    } while (randomBigInt < min || randomBigInt > max)

    return randomBigInt
  }

  private generateRandomBytes(n: number): Uint8Array {
    const arr = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
    return arr
  }
}
