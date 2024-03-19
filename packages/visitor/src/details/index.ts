import type {
  FieldDetailsWithChild,
  ServiceDetails,
  FieldDetails,
  MethodDetails,
  InputDetails,
  GridLayout,
} from "./types"
import { IDL } from "@dfinity/candid"
import { isQuery } from "../helper"
import { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"
import { FieldType } from "../types"

/**
 * Visit the candid file and extract the details.
 * It returns the extracted service details.
 *
 */
export class VisitDetails<A = BaseActor> extends IDL.Visitor<
  string,
  MethodDetails<A> | FieldDetailsWithChild | FieldDetails | ServiceDetails<A>
> {
  public counter = 0
  private height = 0
  private savedY = new Map<string, Map<number, number>>()
  private breakpoints = [
    { name: "xl", size: 6 },
    { name: "md", size: 4 },
    { name: "xs", size: 2 },
  ]

  public visitFunc<M extends FunctionName<A>>(
    t: IDL.FuncClass,
    functionName: M
  ): MethodDetails<A> {
    const functionType = isQuery(t) ? "query" : "update"

    this.height = 5
    const fields = t.argTypes.reduce((acc, arg, index) => {
      this.height += 2
      acc[`arg${index}`] = arg.accept(
        this,
        `arg${index}`
      ) as FieldDetailsWithChild

      return acc
    }, {} as Record<`arg${number}`, FieldDetailsWithChild | FieldDetails>)

    const h = this.height + 2
    const layouts = this.breakpoints.reduce((acc, { name, size }) => {
      const w = 2
      const x = (this.counter * w) % size
      const y = this.savedY.get(name)?.get(x) || 0
      acc[name] = {
        x,
        w,
        y,
        h,
        minH: h,
        minW: 1,
      }
      this.savedY.set(
        name,
        this.savedY.get(name)?.set(x, y + h) || new Map([[x, y + h]])
      )

      return acc
    }, {} as Record<string, GridLayout>)

    return {
      layouts,
      order: this.counter++,
      category: "home",
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
      this.height += 2
      const details = type.accept(this, key) as FieldDetailsWithChild

      acc[key] = details

      return acc
    }, {} as Record<string, FieldDetailsWithChild | FieldDetails>)

    return {
      __type: "record",
      __label,
      __hidden: false,
      __description: t.name,
      ...fields,
    }
  }

  public visitVariant(
    t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    __label: string
  ): FieldDetailsWithChild {
    this.height += 2
    let saveHeight = this.height

    const fields = _fields.reduce((acc, [key, type], index) => {
      const details = type.accept(this, key) as FieldDetailsWithChild
      saveHeight = index === 0 ? this.height + 2 : saveHeight
      acc[key] = details

      return acc
    }, {} as Record<string, FieldDetailsWithChild | FieldDetails>)

    this.height = saveHeight

    return {
      __type: "variant",
      __label,
      __description: t.name,
      ...fields,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    __label: string
  ): FieldDetailsWithChild {
    const fields = components.reduce((acc, type, index) => {
      this.height += 2
      const details = type.accept(this, `_${index}_`) as FieldDetailsWithChild

      acc[`_${index}_`] = details

      return acc
    }, {} as Record<string, FieldDetailsWithChild | FieldDetails>)

    return {
      __type: "tuple",
      __label,
      __hidden: false,
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
      __hidden: false,
      __description: t.name,
    }
  }

  public visitOpt<T>(
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    __label: string
  ): FieldDetailsWithChild {
    const saveHeight = this.height
    const details = ty.accept(this, __label) as FieldDetailsWithChild
    this.height = saveHeight
    return {
      __type: "optional",
      __checked: false,
      __label,
      __hidden: false,
      __description: t.name,
      optional: details,
    }
  }

  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    __label: string
  ): FieldDetailsWithChild {
    const saveHeight = this.height
    const details = ty.accept(this, __label) as FieldDetailsWithChild
    this.height = saveHeight
    return {
      __type: "vector",
      __label,
      __description: t.name,
      vector: details,
    }
  }

  private visiGenericType = <T>(
    t: IDL.Type<T>,
    __type: FieldType,
    __label: string
  ): InputDetails => {
    this.height += 2
    return {
      __type,
      __label,
      __description: t.name,
    }
  }

  public visitBool(t: IDL.BoolClass, __label: string): InputDetails {
    this.height -= 2
    return this.visiGenericType(t, "boolean", __label)
  }

  public visitNull(t: IDL.NullClass, __label: string): InputDetails {
    this.height -= 2
    return this.visiGenericType(t, "null", __label)
  }

  public visitType<T>(t: IDL.Type<T>, __label: string): InputDetails {
    return this.visiGenericType(t, "unknown", __label)
  }

  public visitPrincipal(t: IDL.PrincipalClass, __label: string): InputDetails {
    return this.visiGenericType(t, "principal", __label)
  }

  public visitText(t: IDL.TextClass, label: string): InputDetails {
    return this.visiGenericType(t, "text", label)
  }

  public visitNumber<T>(t: IDL.Type<T>, __label: string): InputDetails {
    return this.visiGenericType(t, "number", __label)
  }

  public visitInt = this.visitNumber
  public visitNat = this.visitNumber
  public visitFloat = this.visitNumber
  public visitFixedInt = this.visitNumber
  public visitFixedNat = this.visitNumber

  public visitService(t: IDL.ServiceClass): ServiceDetails<A> {
    const methodDetails = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodDetails<A>

      return acc
    }, {} as ServiceDetails<A>)

    return methodDetails
  }
}
