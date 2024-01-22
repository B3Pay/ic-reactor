import type {
  FieldDetailsWithChild,
  ServiceFieldDetails,
  FieldDetails,
  FunctionDetails,
  ExtractedServiceDetails,
} from "./types"
import { IDL } from "@dfinity/candid"
import { is_query } from "../helper"
import { ActorSubclass } from "@dfinity/agent"

export * from "./types"

export class ExtractDetails<A extends ActorSubclass<any>> extends IDL.Visitor<
  string,
  | ExtractedServiceDetails<A>
  | FunctionDetails<A>
  | FieldDetailsWithChild
  | FieldDetails
> {
  public counter = 0

  public visitService(
    t: IDL.ServiceClass,
    canisterId: string
  ): ExtractedServiceDetails<A> {
    const methodDetails = t._fields.reduce((acc, services) => {
      const functionName = services[0] as keyof A & string
      const func = services[1]

      const functionDetails = func.accept(
        this,
        functionName
      ) as FunctionDetails<A>

      acc[functionName] = functionDetails

      return acc
    }, {} as ServiceFieldDetails<A>)

    return {
      canisterId,
      description: t.name,
      methodDetails,
    }
  }

  public visitFunc(
    t: IDL.FuncClass,
    functionName: keyof A & string
  ): FunctionDetails<A> {
    const functionType = is_query(t) ? "query" : "update"

    const fields = t.argTypes.reduce((acc, arg, index) => {
      const details = arg.accept(this, `arg${index}`) as FieldDetailsWithChild

      acc[`arg${index}`] = details

      return acc
    }, {} as Record<`arg${number}`, FieldDetailsWithChild | FieldDetails>)

    return {
      order: this.counter++,
      functionName,
      functionType,
      __label: functionName,
      __description: t.name,
      ...fields,
    }
  }

  public visitRecord(
    t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    __label: string
  ): FieldDetailsWithChild {
    const fields = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, key) as FieldDetailsWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, FieldDetailsWithChild | FieldDetails>)

    return {
      __label,
      __description: t.name,
      __type: "record",
      ...fields,
    }
  }

  public visitVariant(
    t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    __label: string
  ): FieldDetailsWithChild {
    const fields = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, key) as FieldDetailsWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, FieldDetailsWithChild | FieldDetails>)

    return {
      __label,
      __type: "variant",
      __description: t.name,
      ...fields,
    }
  }

  public visitTuple<T extends any[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    __label: string
  ): FieldDetailsWithChild {
    const fields = components.reduce((acc, type, index) => {
      const details = type.accept(this, `_${index}_`) as FieldDetailsWithChild

      acc[`_${index}_`] = details

      return acc
    }, {} as Record<string, FieldDetailsWithChild | FieldDetails>)

    return {
      __label,
      __type: "tuple",
      __description: t.name,
      ...fields,
    }
  }

  private visitedRecursive: Record<string, true> = {}
  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    __label: string
  ): FieldDetailsWithChild {
    const recLabel = `${__label}_${this.counter}`
    if (!this.visitedRecursive[recLabel]) {
      this.visitedRecursive[recLabel] = true

      return ty.accept(this, __label) as FieldDetailsWithChild
    }

    return {
      __label,
      __type: "recursive",
      __description: t.name,
    }
  }

  public visitOpt<T>(
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    __label: string
  ): FieldDetailsWithChild {
    const details = ty.accept(this, __label) as FieldDetailsWithChild

    return {
      __label,
      __type: "optional",
      __description: t.name,
      optional: details,
    }
  }

  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    __label: string
  ): FieldDetailsWithChild {
    const details = ty.accept(this, __label) as FieldDetailsWithChild

    return {
      __label,
      __type: "vector",
      __description: t.name,
      vector: details,
    }
  }

  public visitType<T>(t: IDL.Type<T>, __label: string): FieldDetails {
    return {
      __label,
      __type: "unknown",
      __description: t.name,
    }
  }

  public visitPrincipal(t: IDL.PrincipalClass, __label: string): FieldDetails {
    return {
      __label,
      __type: "principal",
      __description: t.name,
    }
  }

  public visitBool(t: IDL.BoolClass, __label: string): FieldDetails {
    return {
      __label,
      __type: "boolean",
      __description: t.name,
    }
  }

  public visitNull(t: IDL.NullClass, __label: string): FieldDetails {
    return {
      __label,
      __type: "null",
      __description: t.name,
    }
  }

  public visitText(t: IDL.TextClass, __label: string): FieldDetails {
    return {
      __label,
      __type: "text",
      __description: t.name,
    }
  }

  public visitNumber<T>(t: IDL.Type<T>, __label: string): FieldDetails {
    return {
      __label,
      __type: "number",
      __description: t.name,
    }
  }

  public visitInt = this.visitNumber
  public visitNat = this.visitNumber
  public visitFloat = this.visitNumber
  public visitFixedInt = this.visitNumber
  public visitFixedNat = this.visitNumber
}
