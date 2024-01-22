import type {
  FieldDetailsWithChild,
  ServiceDetails,
  FieldDetails,
  MethodDetails,
  ExtractedServiceDetails,
} from "./types"
import { IDL } from "@dfinity/candid"
import { is_query } from "../helper"
import { ActorSubclass } from "@dfinity/agent"
import { FieldType, FunctionName } from "../types"
import { DefaultActorType } from "../../types"

export * from "./types"

export class ExtractDetails<
  A extends ActorSubclass<any> = DefaultActorType
> extends IDL.Visitor<
  string,
  | ExtractedServiceDetails<A>
  | MethodDetails<A>
  | FieldDetailsWithChild
  | FieldDetails
> {
  public counter = 0

  public visitService(
    t: IDL.ServiceClass,
    canisterId: string
  ): ExtractedServiceDetails<A> {
    const methodDetails = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      const functionDetails = func.accept(
        this,
        functionName
      ) as MethodDetails<A>

      acc[functionName] = functionDetails

      return acc
    }, {} as ServiceDetails<A>)

    return {
      canisterId,
      description: t.name,
      methodDetails,
    }
  }

  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodDetails<A> {
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
      __type: "record",
      __label,
      __description: t.name,
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
      __type: "variant",
      __label,
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
      __type: "tuple",
      __label,
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
      __type: "recursive",
      __label,
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
      __type: "optional",
      __label,
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
      __type: "vector",
      __label,
      __description: t.name,
      vector: details,
    }
  }

  public visiGenericType = <T>(
    t: IDL.Type<T>,
    __type: FieldType,
    __label: string
  ): FieldDetails => {
    return {
      __type,
      __label,
      __description: t.name,
    }
  }

  public visitType<T>(t: IDL.Type<T>, __label: string): FieldDetails {
    return this.visiGenericType(t, "unknown", __label)
  }

  public visitPrincipal(t: IDL.PrincipalClass, __label: string): FieldDetails {
    return this.visiGenericType(t, "principal", __label)
  }

  public visitBool(t: IDL.BoolClass, __label: string): FieldDetails {
    return this.visiGenericType(t, "boolean", __label)
  }

  public visitNull(t: IDL.NullClass, __label: string): FieldDetails {
    return this.visiGenericType(t, "null", __label)
  }

  public visitText(t: IDL.TextClass, label: string): FieldDetails {
    return this.visiGenericType(t, "text", label)
  }

  public visitNumber<T>(t: IDL.Type<T>, __label: string): FieldDetails {
    return this.visiGenericType(t, "number", __label)
  }

  public visitInt = this.visitNumber
  public visitNat = this.visitNumber
  public visitFloat = this.visitNumber
  public visitFixedInt = this.visitNumber
  public visitFixedNat = this.visitNumber
}
