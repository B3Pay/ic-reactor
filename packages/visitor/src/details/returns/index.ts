import type {
  ReturnDetailsWithChild,
  ReturnDetails,
  ReturnFieldDetails,
  MethodReturnDetails,
  OutputDetails,
} from "./types"
import { IDL } from "@dfinity/candid"
import { isQuery } from "../../helper"
import { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"

/**
 * Visit the candid file and extract the details.
 * It returns the extracted service details.
 *
 */
export class VisitReturnDetails<A = BaseActor> extends IDL.Visitor<
  string,
  | MethodReturnDetails<A>
  | ReturnDetailsWithChild
  | ReturnFieldDetails
  | ReturnDetails<A>
> {
  public counter = 0

  public visitFunc<M extends FunctionName<A>>(
    t: IDL.FuncClass,
    functionName: M
  ): MethodReturnDetails<A> {
    const functionType = isQuery(t) ? "query" : "update"

    const details = t.retTypes.reduce((acc, ret, index) => {
      acc[`ret${index}`] = ret.accept(
        this,
        `__ret${index}`
      ) as ReturnDetailsWithChild

      return acc
    }, {} as Record<`ret${number}`, ReturnDetailsWithChild | ReturnFieldDetails>)

    this.counter++

    return {
      functionName,
      functionType,
      __label: functionName,
      details,
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    __label: string
  ): ReturnDetailsWithChild {
    const fields = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, key) as ReturnDetailsWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, ReturnDetailsWithChild | ReturnFieldDetails>)

    return {
      __label,
      __hidden: /^__arg|^__ret/.test(__label),
      ...fields,
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    __label: string
  ): ReturnDetailsWithChild {
    const fields = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, key) as ReturnDetailsWithChild
      acc[key] = details

      return acc
    }, {} as Record<string, ReturnDetailsWithChild | ReturnFieldDetails>)

    return {
      __label,
      ...fields,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    __label: string
  ): ReturnDetailsWithChild {
    const fields = components.reduce((acc, type, index) => {
      const details = type.accept(this, `_${index}_`) as ReturnDetailsWithChild

      acc[`_${index}_`] = details

      return acc
    }, {} as Record<string, ReturnDetailsWithChild | ReturnFieldDetails>)

    return {
      __label,
      __hidden: false,
      ...fields,
    }
  }

  private visitedRecursive: Record<string, true> = {}
  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    __label: string
  ): ReturnDetailsWithChild {
    const recLabel = `${__label}_${this.counter}`
    if (!this.visitedRecursive[recLabel]) {
      this.visitedRecursive[recLabel] = true

      return ty.accept(this, __label) as ReturnDetailsWithChild
    }

    return {
      __label,
      __hidden: false,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    __label: string
  ): ReturnDetailsWithChild {
    const details = ty.accept(this, __label) as ReturnDetailsWithChild
    return {
      __checked: false,
      __label,
      __hidden: false,
      optional: details,
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    __label: string
  ): ReturnDetailsWithChild {
    const details = ty.accept(this, __label) as ReturnDetailsWithChild
    return {
      __label,
      vector: details,
    }
  }

  private visiGenericType = (__label: string): OutputDetails => {
    return {
      __label,
    }
  }

  public visitBool(_t: IDL.BoolClass, __label: string): OutputDetails {
    return this.visiGenericType(__label)
  }

  public visitNull(_t: IDL.NullClass, __label: string): OutputDetails {
    return this.visiGenericType(__label)
  }

  public visitType<T>(_t: IDL.Type<T>, __label: string): OutputDetails {
    return this.visiGenericType(__label)
  }

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    __label: string
  ): OutputDetails {
    return this.visiGenericType(__label)
  }

  public visitText(_t: IDL.TextClass, label: string): OutputDetails {
    return this.visiGenericType(label)
  }

  public visitNumber<T>(_t: IDL.Type<T>, __label: string): OutputDetails {
    return this.visiGenericType(__label)
  }

  public visitInt = this.visitNumber
  public visitNat = this.visitNumber
  public visitFloat = this.visitNumber
  public visitFixedInt = this.visitNumber
  public visitFixedNat = this.visitNumber

  public visitService(t: IDL.ServiceClass): ReturnDetails<A> {
    const methodDetails = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(
        this,
        functionName
      ) as MethodReturnDetails<A>

      return acc
    }, {} as ReturnDetails<A>)

    return methodDetails
  }
}
