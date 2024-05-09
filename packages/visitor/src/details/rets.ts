import { IDL } from "@dfinity/candid"
import { isQuery, isFieldInTable } from "../helpers"
import { VisitReturns } from "../fields"

import type {
  FieldDetailWithChild,
  DetailType,
  FieldDetail,
  MethodReturnDetail,
  MethodDetail,
} from "./types"
import type { DynamicReturnType, BaseActor, FunctionName } from "../types"
import { Status } from "../status"

/**
 * Visit the candid file and extract the details.
 * It returns the extracted service details.
 *
 */
export class VisitReturnDetails<A = BaseActor> extends IDL.Visitor<
  string,
  MethodReturnDetail<A> | FieldDetailWithChild | FieldDetail | DetailType<A>
> {
  private visitReturnField = new VisitReturns()
  public counter = 0
  private status = Status.Default
  private isTable = false

  public visitFunc<M extends FunctionName<A>>(
    t: IDL.FuncClass,
    functionName: M
  ): MethodReturnDetail<A> {
    const functionType = isQuery(t) ? "query" : "update"

    const detail = t.retTypes.reduce((acc, ret, index) => {
      this.status = Status.Default
      this.isTable = false
      acc[`ret${index}`] = ret.accept(
        this,
        `__ret${index}`
      ) as FieldDetailWithChild

      return acc
    }, {} as MethodReturnDetail<A>["detail"])

    this.counter++

    return {
      label: functionName,
      status: Status.Default,
      functionName,
      functionType,
      detail,
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): FieldDetailWithChild {
    const status = this.status

    const fields = _fields.reduce((acc, [key, type]) => {
      this.status = Status.Default
      const details = type.accept(this, key) as FieldDetailWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, FieldDetailWithChild | FieldDetail>)

    return {
      label,
      status: this.isTable || /^__ret/.test(label) ? Status.Hidden() : status,
      ...fields,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): FieldDetailWithChild {
    const __status = this.status

    const fields = components.reduce((acc, type, index) => {
      this.status = Status.Hidden("Optional")
      const details = type.accept(this, `_${index}_`) as FieldDetailWithChild

      acc[`_${index}_`] = details

      return acc
    }, {} as Record<string, FieldDetailWithChild | FieldDetail>)

    return {
      label,
      __status: this.isTable ? Status.Hidden : __status,
      ...fields,
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): FieldDetailWithChild {
    const __status = this.status

    const fields = _fields.reduce((acc, [key, type]) => {
      this.status = Status.Default
      acc[key] = type.accept(this, key) as FieldDetailWithChild

      return acc
    }, {} as Record<string, FieldDetailWithChild | FieldDetail>)

    return {
      label,
      __status: this.isTable ? Status.Hidden : __status,
      ...fields,
    }
  }

  private visitedRecursive: Record<string, true> = {}
  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): FieldDetailWithChild {
    const recLabel = `${label}_${this.counter}`
    if (!this.visitedRecursive[recLabel]) {
      this.visitedRecursive[recLabel] = true

      return ty.accept(this, label) as FieldDetailWithChild
    }

    return {
      label,
      __status: this.status,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): FieldDetailWithChild {
    const details = ty.accept(this, label) as FieldDetailWithChild

    return {
      label,
      __status: this.isTable ? Status.Hidden() : Status.Hidden("Optional"),
      optional: details,
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): FieldDetailWithChild {
    const field = ty.accept(
      this.visitReturnField,
      label
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
        const list = ty.accept(this, label) as FieldDetailWithChild
        this.isTable = false
        return {
          type: "list",
          __status: Status.Hidden,
          label,
          labelList,
          list,
        }
      }
    }

    this.status = Status.Hidden()
    const vector = ty.accept(this, label) as FieldDetailWithChild
    this.status = Status.Default
    return {
      __status: Status.Visible("Optional"),
      label,
      vector,
    }
  }

  public visitNull(_t: IDL.NullClass, label: string): MethodDetail {
    return {
      label,
      __status: Status.Visible("Optional"),
    }
  }

  private visiGenericType = (label: string): MethodDetail => {
    if (this.isTable) {
      return {
        label,
        __status: Status.Hidden,
      } as MethodDetail
    }
    return {
      label,
      __status: this.status,
    }
  }

  public visitBool(_t: IDL.BoolClass, label: string): MethodDetail {
    return this.visiGenericType(label)
  }

  public visitType<T>(_t: IDL.Type<T>, label: string): MethodDetail {
    return this.visiGenericType(label)
  }

  public visitPrincipal(_t: IDL.PrincipalClass, label: string): MethodDetail {
    return this.visiGenericType(label)
  }

  public visitText(_t: IDL.TextClass, label: string): MethodDetail {
    return this.visiGenericType(label)
  }

  public visitNumber<T>(_t: IDL.Type<T>, label: string): MethodDetail {
    return this.visiGenericType(label)
  }

  public visitInt = this.visitNumber
  public visitNat = this.visitNumber
  public visitFloat = this.visitNumber
  public visitFixedInt = this.visitNumber
  public visitFixedNat = this.visitNumber

  public visitService(t: IDL.ServiceClass): DetailType<A> {
    const methodDetails = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(
        this,
        functionName
      ) as MethodReturnDetail<A>

      return acc
    }, {} as DetailType<A>)

    return methodDetails
  }
}
