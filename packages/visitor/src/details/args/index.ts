import { IDL } from "@dfinity/candid"
import { isQuery } from "../../helpers"

import type {
  ArgDetailsWithChild,
  ArgDetails,
  ArgFieldDetails,
  MethodArgDetails,
  InputDetails,
} from "./types"
import type { BaseActor, FunctionName } from "../../types"

/**
 * Visit the candid file and extract the details.
 * It returns the extracted service details.
 *
 */
export class VisitArgDetails<A = BaseActor> extends IDL.Visitor<
  string,
  MethodArgDetails<A> | ArgDetailsWithChild | ArgFieldDetails | ArgDetails<A>
> {
  public counter = 0

  public visitFunc<M extends FunctionName<A>>(
    t: IDL.FuncClass,
    functionName: M
  ): MethodArgDetails<A> {
    const functionType = isQuery(t) ? "query" : "update"

    const details = t.argTypes.reduce((acc, arg, index) => {
      acc[`arg${index}`] = arg.accept(
        this,
        `__arg${index}`
      ) as ArgDetailsWithChild

      return acc
    }, {} as Record<`arg${number}`, ArgDetailsWithChild | ArgFieldDetails>)

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
  ): ArgDetailsWithChild {
    const fields = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, key) as ArgDetailsWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, ArgDetailsWithChild | ArgFieldDetails>)

    return {
      __label,
      __hide_label: /^__arg|/.test(__label),
      ...fields,
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    __label: string
  ): ArgDetailsWithChild {
    const fields = _fields.reduce((acc, [key, type]) => {
      const details = type.accept(this, key) as ArgDetailsWithChild
      acc[key] = details

      return acc
    }, {} as Record<string, ArgDetailsWithChild | ArgFieldDetails>)

    return {
      __label,
      ...fields,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    __label: string
  ): ArgDetailsWithChild {
    const fields = components.reduce((acc, type, index) => {
      const details = type.accept(this, `_${index}_`) as ArgDetailsWithChild

      acc[`_${index}_`] = details

      return acc
    }, {} as Record<string, ArgDetailsWithChild | ArgFieldDetails>)

    return {
      __label,
      __hide_label: false,
      ...fields,
    }
  }

  private visitedRecursive: Record<string, true> = {}
  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    __label: string
  ): ArgDetailsWithChild {
    const recLabel = `${__label}_${this.counter}`
    if (!this.visitedRecursive[recLabel]) {
      this.visitedRecursive[recLabel] = true

      return ty.accept(this, __label) as ArgDetailsWithChild
    }

    return {
      __label,
      __hide_label: false,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    __label: string
  ): ArgDetailsWithChild {
    const details = ty.accept(this, __label) as ArgDetailsWithChild
    return {
      __checked: false,
      __label,
      __hide_label: false,
      optional: details,
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    __label: string
  ): ArgDetailsWithChild {
    const details = ty.accept(this, __label) as ArgDetailsWithChild
    return {
      __label,
      vector: details,
    }
  }

  public visitNull(_t: IDL.NullClass, __label: string): InputDetails {
    return {
      __label,
      __hide_label: true,
    }
  }

  private visiGenericType = (__label: string): InputDetails => {
    return {
      __label,
    }
  }

  public visitBool(_t: IDL.BoolClass, __label: string): InputDetails {
    return this.visiGenericType(__label)
  }

  public visitType<T>(_t: IDL.Type<T>, __label: string): InputDetails {
    return this.visiGenericType(__label)
  }

  public visitPrincipal(_t: IDL.PrincipalClass, __label: string): InputDetails {
    return this.visiGenericType(__label)
  }

  public visitText(_t: IDL.TextClass, label: string): InputDetails {
    return this.visiGenericType(label)
  }

  public visitNumber<T>(_t: IDL.Type<T>, __label: string): InputDetails {
    return this.visiGenericType(__label)
  }

  public visitInt = this.visitNumber
  public visitNat = this.visitNumber
  public visitFloat = this.visitNumber
  public visitFixedInt = this.visitNumber
  public visitFixedNat = this.visitNumber

  public visitService(t: IDL.ServiceClass): ArgDetails<A> {
    const methodDetails = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodArgDetails<A>

      return acc
    }, {} as ArgDetails<A>)

    return methodDetails
  }
}
