import { IDL } from "@dfinity/candid"
import { Principal } from "@dfinity/principal"

export class Parse extends IDL.Visitor<string, any> {
  public visitNull(_t: IDL.NullClass, _v: string): null {
    return null
  }
  public visitBool(_t: IDL.BoolClass, v: string): boolean {
    if (v === "true") {
      return true
    }
    if (v === "false") {
      return false
    }
    throw new Error(`Cannot parse ${v} as boolean`)
  }
  public visitText(_t: IDL.TextClass, v: string): string {
    return v
  }
  public visitFloat(_t: IDL.FloatClass, v: string): number {
    return parseFloat(v)
  }
  public visitFixedInt(t: IDL.FixedIntClass, v: string): number | bigint {
    if (t._bits <= 32) {
      return parseInt(v, 10)
    } else {
      return BigInt(v)
    }
  }
  public visitFixedNat(t: IDL.FixedNatClass, v: string): number | bigint {
    if (t._bits <= 32) {
      return parseInt(v, 10)
    } else {
      return BigInt(v)
    }
  }
  public visitNumber(_t: IDL.PrimitiveType, v: string): bigint {
    return BigInt(v)
  }
  public visitPrincipal(_t: IDL.PrincipalClass, v: string): Principal {
    return Principal.fromText(v)
  }
  public visitService(_t: IDL.ServiceClass, v: string): Principal {
    return Principal.fromText(v)
  }
  public visitFunc(_t: IDL.FuncClass, v: string): [Principal, string] {
    const x = v.split(".", 2)
    return [Principal.fromText(x[0]), x[1]]
  }
}
