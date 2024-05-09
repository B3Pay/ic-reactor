import { IDL } from "@dfinity/candid"
import { isQuery } from "../helpers"

import type {
  DetailType,
  FieldDetail,
  FieldDetailWithChild,
  MethodArgDetail,
} from "./types"
import type { BaseActor, FunctionName } from "../types"
import { Status } from "../status"

/**
 * Visit the candid file and extract the details.
 * It returns the extracted service details.
 *
 */
export class VisitArgDetails<A = BaseActor> extends IDL.Visitor<
  string,
  DetailType<A> | MethodArgDetail<A> | FieldDetailWithChild | FieldDetail
> {
  public counter = 0

  public visitFunc<M extends FunctionName<A>>(
    t: IDL.FuncClass,
    functionName: M
  ): MethodArgDetail<A> {
    const functionType = isQuery(t) ? "query" : "update"

    const detail = t.argTypes.reduce((acc, arg, index) => {
      acc[`arg${index}`] = arg.accept(
        this,
        `__arg${index}`
      ) as FieldDetailWithChild

      return acc
    }, {} as Record<`arg${number}`, FieldDetailWithChild>)

    this.counter++

    return {
      functionName,
      functionType,
      label: functionName,
      detail,
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): FieldDetailWithChild {
    const record = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, key) as FieldDetailWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, FieldDetailWithChild | FieldDetail>)

    return {
      label,
      status: /^__arg|/.test(label)
        ? Status.Hidden("Optional")
        : Status.Visible("Optional"),
      record,
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): FieldDetailWithChild {
    const variant = _fields.reduce((acc, [key, type]) => {
      acc[key] = type.accept(this, key) as FieldDetailWithChild

      return acc
    }, {} as Record<string, FieldDetailWithChild>)

    return {
      label,
      status: Status.Default,
      variant,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): FieldDetailWithChild {
    const tuple = components.reduce((acc, type, index) => {
      acc[`_${index}_`] = type.accept(
        this,
        `_${index}_`
      ) as FieldDetailWithChild

      return acc
    }, {} as Record<string, FieldDetailWithChild | FieldDetail>)

    return {
      label,
      status: Status.Hidden("Optional"),
      tuple,
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
      status: false,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): FieldDetailWithChild {
    const optional = ty.accept(this, label) as FieldDetailWithChild
    return {
      status: false,
      label,
      optional,
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): FieldDetailWithChild {
    const vector = ty.accept(this, label) as FieldDetailWithChild
    return {
      label,
      status: Status.Default,
      vector,
    }
  }

  public visitNull(_t: IDL.NullClass, label: string): FieldDetail {
    return {
      label,
      status: true,
    }
  }

  private visiGenericType = (label: string): FieldDetail => {
    return {
      label,
      status: Status.Default,
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

  public visitService(t: IDL.ServiceClass): DetailType<A> {
    const methodDetails = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodArgDetail<A>

      return acc
    }, {} as DetailType<A>)

    return methodDetails
  }
}
