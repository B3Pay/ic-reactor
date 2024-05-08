import { IDL } from "@dfinity/candid"
import { isQuery, isFieldInTable } from "../../helpers"
import { VisitReturns } from "../../fields"

import type {
  ReturnDetailsWithChild,
  ReturnDetails,
  ReturnFieldDetails,
  MethodReturnDetails,
  OutputDetails,
} from "./types"
import type { DynamicReturnType, BaseActor, FunctionName } from "../../types"
import { Status } from "../../status"

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
  private visitReturnField = new VisitReturns()
  public counter = 0
  private status = Status.Default
  private isTable = false

  public visitFunc<M extends FunctionName<A>>(
    t: IDL.FuncClass,
    functionName: M
  ): MethodReturnDetails<A> {
    const functionType = isQuery(t) ? "query" : "update"

    const details = t.retTypes.reduce((acc, ret, index) => {
      this.status = Status.Default
      this.isTable = false
      acc[`ret${index}`] = ret.accept(
        this,
        `__ret${index}`
      ) as ReturnDetailsWithChild

      return acc
    }, {} as Record<`ret${number}`, ReturnDetailsWithChild | ReturnFieldDetails>)

    this.counter++

    return {
      __label: functionName,
      __status: Status.Default,
      functionName,
      functionType,
      details,
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    __label: string
  ): ReturnDetailsWithChild {
    const __status = this.status

    const fields = _fields.reduce((acc, [key, type]) => {
      this.status = Status.Default
      const details = type.accept(this, key) as ReturnDetailsWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, ReturnDetailsWithChild | ReturnFieldDetails>)

    return {
      __label,
      __status:
        this.isTable || /^__ret/.test(__label) ? Status.Hidden : __status,
      ...fields,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    __label: string
  ): ReturnDetailsWithChild {
    const __status = this.status

    const fields = components.reduce((acc, type, index) => {
      this.status = Status.Hidden("Optional")
      const details = type.accept(this, `_${index}_`) as ReturnDetailsWithChild

      acc[`_${index}_`] = details

      return acc
    }, {} as Record<string, ReturnDetailsWithChild | ReturnFieldDetails>)

    return {
      __label,
      __status: this.isTable ? Status.Hidden : __status,
      ...fields,
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    __label: string
  ): ReturnDetailsWithChild {
    const __status = this.status

    const fields = _fields.reduce((acc, [key, type]) => {
      this.status = Status.Default
      acc[key] = type.accept(this, key) as ReturnDetailsWithChild

      return acc
    }, {} as Record<string, ReturnDetailsWithChild | ReturnFieldDetails>)

    return {
      __label,
      __status: this.isTable ? Status.Hidden : __status,
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
      __status: this.status,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    __label: string
  ): ReturnDetailsWithChild {
    const details = ty.accept(this, __label) as ReturnDetailsWithChild

    return {
      __label,
      __status: this.isTable ? Status.Hidden() : Status.Hidden("Optional"),
      optional: details,
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    __label: string
  ): ReturnDetailsWithChild {
    const field = ty.accept(
      this.visitReturnField,
      __label
    ) as DynamicReturnType<"record">

    if (field.type === "record") {
      const labelList: string[] = []

      const isList = field.fields.every((field) => {
        if (isFieldInTable(field)) {
          if (field.label) {
            labelList.push(field.label)
            return true
          }
        }
        return false
      })

      if (isList) {
        this.isTable = true
        const list = ty.accept(this, __label) as ReturnDetailsWithChild
        this.isTable = false
        return {
          type: "list",
          __status: Status.Hidden,
          __label,
          labelList,
          list,
        }
      }
    }

    this.status = Status.Hidden()
    const vector = ty.accept(this, __label) as ReturnDetailsWithChild
    this.status = Status.Default
    return {
      __status: Status.Visible("Optional"),
      __label,
      vector,
    }
  }

  public visitNull(_t: IDL.NullClass, __label: string): OutputDetails {
    return {
      __label,
      __status: Status.Visible("Optional"),
    }
  }

  private visiGenericType = (__label: string): OutputDetails => {
    if (this.isTable) {
      return {
        __label,
        __status: Status.Hidden,
      } as OutputDetails
    }
    return {
      __label,
      __status: this.status,
    }
  }

  public visitBool(_t: IDL.BoolClass, __label: string): OutputDetails {
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

  public visitText(_t: IDL.TextClass, __label: string): OutputDetails {
    return this.visiGenericType(__label)
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
