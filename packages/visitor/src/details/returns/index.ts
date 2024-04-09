import type {
  ReturnDetailsWithChild,
  ReturnDetails,
  ReturnFieldDetails,
  MethodReturnDetails,
  OutputDetails,
  ReturnDetailsParams,
} from "./types"
import { IDL } from "@dfinity/candid"
import { isQuery } from "../../helper"
import { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"
import { VisitReturns } from "../../fields"
import { DynamicReturnType } from "../../types"
import { isFieldInTable } from "../../fields/returns/helpers"

/**
 * Visit the candid file and extract the details.
 * It returns the extracted service details.
 *
 */
export class VisitReturnDetails<A = BaseActor> extends IDL.Visitor<
  ReturnDetailsParams<A>,
  | MethodReturnDetails<A>
  | ReturnDetailsWithChild
  | ReturnFieldDetails
  | ReturnDetails<A>
> {
  private visitReturnField = new VisitReturns()
  public counter = 0

  public visitFunc(
    t: IDL.FuncClass,
    params: ReturnDetailsParams<A>
  ): MethodReturnDetails<A> {
    const functionType = isQuery(t) ? "query" : "update"

    const details = t.retTypes.reduce((acc, ret, index) => {
      acc[`ret${index}`] = ret.accept(this, {
        __label: `__ret${index}`,
      }) as ReturnDetailsWithChild

      return acc
    }, {} as Record<`ret${number}`, ReturnDetailsWithChild | ReturnFieldDetails>)

    this.counter++

    return {
      ...params,
      functionName: params.__label,
      functionType,
      details,
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    params: ReturnDetailsParams
  ): ReturnDetailsWithChild {
    const fields = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, {
        __label: key,
        __show_label: true,
      }) as ReturnDetailsWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, ReturnDetailsWithChild | ReturnFieldDetails>)

    return {
      ...params,
      ...fields,
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    params: ReturnDetailsParams
  ): ReturnDetailsWithChild {
    const fields = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, {
        __label: key,
      }) as ReturnDetailsWithChild
      acc[key] = details

      return acc
    }, {} as Record<string, ReturnDetailsWithChild | ReturnFieldDetails>)

    return {
      ...params,
      ...fields,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    params: ReturnDetailsParams
  ): ReturnDetailsWithChild {
    const fields = components.reduce((acc, type, index) => {
      const details = type.accept(this, {
        __label: `_${index}_`,
      }) as ReturnDetailsWithChild

      acc[`_${index}_`] = details

      return acc
    }, {} as Record<string, ReturnDetailsWithChild | ReturnFieldDetails>)

    return {
      ...params,
      ...fields,
    }
  }

  private visitedRecursive: Record<string, true> = {}
  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    params: ReturnDetailsParams
  ): ReturnDetailsWithChild {
    const recLabel = `${params.__label}_${this.counter}`
    if (!this.visitedRecursive[recLabel]) {
      this.visitedRecursive[recLabel] = true

      return ty.accept(this, params) as ReturnDetailsWithChild
    }

    return params
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    params: ReturnDetailsParams
  ): ReturnDetailsWithChild {
    const details = ty.accept(this, params) as ReturnDetailsWithChild

    return {
      __label: params.__label,
      optional: details,
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    params: ReturnDetailsParams
  ): ReturnDetailsWithChild {
    const field = ty.accept(
      this.visitReturnField,
      params.__label
    ) as DynamicReturnType<"record">

    if (field.type === "record") {
      const isList = field.fields.every((field) => {
        if (isFieldInTable(field)) {
          if (field.label) {
            return true
          }
        }
        return false
      })

      if (isList) {
        const vector = ty.accept(this, {
          __label: params.__label,
        }) as ReturnDetailsWithChild
        return {
          __label: params.__label,
          vector,
        }
      }
    }

    const vector = ty.accept(this, {
      __label: params.__label,
    }) as ReturnDetailsWithChild

    return {
      ...params,
      vector,
    }
  }

  private visiGenericType = (params: ReturnDetailsParams): OutputDetails => {
    return params
  }

  public visitBool(
    _t: IDL.BoolClass,
    params: ReturnDetailsParams
  ): OutputDetails {
    return this.visiGenericType(params)
  }

  public visitNull(
    _t: IDL.NullClass,
    params: ReturnDetailsParams
  ): OutputDetails {
    return this.visiGenericType(params)
  }

  public visitType<T>(
    _t: IDL.Type<T>,
    params: ReturnDetailsParams
  ): OutputDetails {
    return this.visiGenericType(params)
  }

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    params: ReturnDetailsParams
  ): OutputDetails {
    return this.visiGenericType(params)
  }

  public visitText(
    _t: IDL.TextClass,
    params: ReturnDetailsParams
  ): OutputDetails {
    return this.visiGenericType(params)
  }

  public visitNumber<T>(
    _t: IDL.Type<T>,
    params: ReturnDetailsParams
  ): OutputDetails {
    return this.visiGenericType(params)
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

      acc[functionName] = func.accept(this, {
        __label: functionName,
      }) as MethodReturnDetails<A>

      return acc
    }, {} as ReturnDetails<A>)

    return methodDetails
  }
}
