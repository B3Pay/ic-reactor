import type {
  ExtractTypeFromIDLType,
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
    const type = is_query(t) ? "query" : "update"

    const fields = t.argTypes.reduce((acc, arg, index) => {
      const details = arg.accept(this, `arg${index}`) as ExtractTypeFromIDLType<
        typeof arg
      >

      acc.push(details)

      return acc
    }, [] as FieldDetailsWithChild[] | FieldDetails[])

    return {
      order: this.counter++,
      label: functionName,
      description: t.name,
      functionName,
      type,
      fields,
    }
  }

  public visitRecord(
    t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): FieldDetailsWithChild {
    const fields = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, key) as FieldDetailsWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, FieldDetailsWithChild | FieldDetails>)

    return {
      label,
      type: "record",
      description: t.name,
      fields,
    }
  }

  public visitVariant(
    t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): FieldDetailsWithChild {
    const fields = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, key) as FieldDetailsWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, FieldDetailsWithChild | FieldDetails>)

    return {
      label,
      type: "variant",
      description: t.name,
      fields,
    }
  }

  public visitTuple<T extends any[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): FieldDetailsWithChild {
    const fields = components.reduce((acc, type, index) => {
      const details = type.accept(this, `_${index}_`) as FieldDetailsWithChild

      acc[index] = details

      return acc
    }, [] as (FieldDetailsWithChild | FieldDetails)[])

    return {
      label,
      type: "tuple",
      description: t.name,
      fields,
    }
  }

  private recDetails: Record<
    string,
    { visited: boolean; details: FieldDetailsWithChild }
  > = {}

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): FieldDetailsWithChild {
    if (!this.recDetails[this.counter]?.visited) {
      this.recDetails[this.counter] = {
        visited: true,
        details: {} as FieldDetailsWithChild,
      }

      this.recDetails[this.counter].details = ty.accept(
        this,
        label
      ) as FieldDetailsWithChild
    }

    return {
      label,
      type: "recursive",
      description: t.name,
      fields: this.recDetails[this.counter].details,
    }
  }

  public visitOpt<T>(
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): FieldDetailsWithChild {
    const details = ty.accept(this, label) as FieldDetailsWithChild

    return {
      label,
      type: "optional",
      description: t.name,
      fields: [details],
    }
  }

  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): FieldDetailsWithChild {
    const details = ty.accept(this, label) as FieldDetailsWithChild

    return {
      label,
      type: "vector",
      description: t.name,
      fields: [details],
    }
  }

  public visitType<T>(t: IDL.Type<T>, label: string): FieldDetails {
    return {
      label,
      type: "unknown",
      description: t.name,
    }
  }

  public visitPrincipal(t: IDL.PrincipalClass, label: string): FieldDetails {
    return {
      label,
      type: "principal",
      description: t.name,
    }
  }

  public visitBool(t: IDL.BoolClass, label: string): FieldDetails {
    return {
      label,
      type: "boolean",
      description: t.name,
    }
  }

  public visitNull(t: IDL.NullClass, label: string): FieldDetails {
    return {
      label,
      type: "null",
      description: t.name,
    }
  }

  public visitText(t: IDL.TextClass, label: string): FieldDetails {
    return {
      label,
      type: "text",
      description: t.name,
    }
  }

  public visitNumber<T>(t: IDL.Type<T>, label: string): FieldDetails {
    return {
      label,
      type: "number",
      description: t.name,
    }
  }

  public visitInt(t: IDL.IntClass, label: string): FieldDetails {
    return this.visitNumber(t, label)
  }

  public visitNat(t: IDL.NatClass, label: string): FieldDetails {
    return this.visitNumber(t, label)
  }

  public visitFloat(t: IDL.FloatClass, label: string): FieldDetails {
    return this.visitNumber(t, label)
  }

  public visitFixedInt(t: IDL.FixedIntClass, label: string): FieldDetails {
    return this.visitNumber(t, label)
  }

  public visitFixedNat(t: IDL.FixedNatClass, label: string): FieldDetails {
    return this.visitNumber(t, label)
  }
}
