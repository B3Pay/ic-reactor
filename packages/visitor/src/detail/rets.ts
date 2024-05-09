import { IDL } from "@dfinity/candid"
import { isQuery, isFieldInTable } from "../helpers"
import { VisitReturn } from "../field"

import type {
  FieldDetailWithChild,
  ReturnDetailRecord,
  FieldDetail,
  MethodReturnDetail,
} from "./types"
import type { DynamicReturnType, BaseActor, FunctionName } from "../types"
import { Status } from "../status"

/**
 * Visit the candid file and extract the details.
 * It returns the extracted service details.
 *
 */
export class VisitReturnDetail<A = BaseActor> extends IDL.Visitor<
  string,
  | ReturnDetailRecord<A>
  | MethodReturnDetail<A>
  | FieldDetailWithChild
  | FieldDetail
> {
  private visitReturnField = new VisitReturn()
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
      detail,
      label: functionName,
      status: Status.Default,
      functionName,
      functionType,
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): FieldDetailWithChild {
    const savedStatus = this.status

    const record = _fields.reduce((acc, [key, type]) => {
      this.status = Status.Default
      const details = type.accept(this, key) as FieldDetailWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, FieldDetailWithChild>)

    const status = this.isTable
      ? Status.Hidden()
      : /^__ret/.test(label)
      ? Status.Hidden("Optional")
      : savedStatus

    return {
      label,
      status,
      record,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): FieldDetailWithChild {
    const savedStatus = this.status

    const tuple = components.reduce((acc, type, index) => {
      this.status = Status.Hidden("Optional")
      const details = type.accept(this, `_${index}_`) as FieldDetailWithChild

      acc[`_${index}_`] = details

      return acc
    }, {} as Record<string, FieldDetailWithChild | FieldDetail>)

    return {
      label,
      status: this.isTable ? Status.Enabled("Optional") : savedStatus,
      tuple,
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): FieldDetailWithChild {
    const saveStatus = this.status

    const variant = _fields.reduce((acc, [key, type]) => {
      this.status = Status.Visible("Optional")
      acc[key] = type.accept(this, key) as FieldDetailWithChild

      return acc
    }, {} as Record<string, FieldDetailWithChild>)

    return {
      label,
      status: this.isTable ? Status.Enabled("Optional") : saveStatus,
      variant,
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
      status: this.status,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): FieldDetailWithChild {
    const optional = ty.accept(this, label) as FieldDetailWithChild

    return {
      label,
      status: this.isTable
        ? Status.Enabled("Optional")
        : Status.Hidden("Optional"),
      optional,
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
        this.status = Status.Visible("Optional")
        const record = ty.accept(this, label) as FieldDetailWithChild
        this.isTable = false

        return {
          ...record,
          status: Status.Hidden("Optional"),
          labelList,
        }
      }
    }

    this.status = Status.Hidden("Optional", "Dynamic")
    const vector = ty.accept(this, label) as FieldDetailWithChild[]
    this.status = Status.Default

    return {
      status: Status.Visible("Optional"),
      label,
      vector,
    }
  }

  public visitNull(_t: IDL.NullClass, label: string): FieldDetail {
    return {
      label,
      status: Status.Visible(),
    }
  }

  private visiGenericType = (label: string): FieldDetail => {
    if (this.isTable) {
      return {
        label,
        status: Status.Enabled("Optional"),
      }
    }

    return {
      label,
      status: this.status,
    }
  }

  public visitBool(_t: IDL.BoolClass, label: string) {
    return this.visiGenericType(label)
  }

  public visitType<T>(_t: IDL.Type<T>, label: string) {
    return this.visiGenericType(label)
  }

  public visitPrincipal(_t: IDL.PrincipalClass, label: string) {
    return this.visiGenericType(label)
  }

  public visitText(_t: IDL.TextClass, label: string) {
    return this.visiGenericType(label)
  }

  public visitNumber<T>(_t: IDL.Type<T>, label: string) {
    return this.visiGenericType(label)
  }

  public visitInt = this.visitNumber
  public visitNat = this.visitNumber
  public visitFloat = this.visitNumber
  public visitFixedInt = this.visitNumber
  public visitFixedNat = this.visitNumber

  public visitService(t: IDL.ServiceClass): ReturnDetailRecord<A> {
    const methodDetails = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(
        this,
        functionName
      ) as MethodReturnDetail<A>

      return acc
    }, {} as ReturnDetailRecord<A>)

    return methodDetails
  }
}
