import type { ServiceLayouts } from "./types"
import { IDL } from "@dfinity/candid"
import { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"
import { findCategory } from "./helpers"

/**
 * Visit the candid file and extract the details.
 * It returns the extracted service details.
 *
 */
export class VisitLayouts<A = BaseActor> extends IDL.Visitor<
  string,
  ServiceLayouts<A> | number | void
> {
  public counter = 0
  public height = 0

  public visitFunc(t: IDL.FuncClass): number {
    this.height = 5
    t.argTypes.forEach((arg, index) => {
      this.height += 2
      arg.accept(this, `arg${index}`)
    })

    return this.height + 2
  }

  public visitRecord(_t: IDL.RecordClass, _fields: Array<[string, IDL.Type]>) {
    _fields.forEach(([key, type]) => {
      this.height += 2
      type.accept(this, key)
    })
  }

  public visitVariant(
    _t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>
  ) {
    this.height += 2
    let saveHeight = this.height

    _fields.forEach(([key, type], index) => {
      type.accept(this, key)
      saveHeight = index === 0 ? this.height + 2 : saveHeight
    })

    this.height = saveHeight
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[]
  ) {
    components.forEach((type, index) => {
      this.height += 2
      type.accept(this, `_${index}_`)
    })
  }

  private visitedRecursive: Record<string, true> = {}
  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ) {
    const recLabel = `${label}_${this.counter}`
    if (!this.visitedRecursive[recLabel]) {
      this.visitedRecursive[recLabel] = true

      ty.accept(this, label)
    }
  }

  public visitOpt<T>(_t: IDL.OptClass<T>, ty: IDL.Type<T>, label: string) {
    const saveHeight = this.height
    ty.accept(this, label)
    this.height = saveHeight
  }

  public visitVec<T>(_t: IDL.VecClass<T>, ty: IDL.Type<T>, label: string) {
    const saveHeight = this.height
    ty.accept(this, label)
    this.height = saveHeight
  }

  public visitType<T>(_t: IDL.Type<T>) {
    this.height
  }

  public visitPrincipal(_t: IDL.PrincipalClass) {
    this.height += 2
  }

  public visitText(_t: IDL.TextClass) {
    this.height += 2
  }

  public visitNumber<T>(_t: IDL.Type<T>) {
    this.height += 2
  }

  public visitInt = this.visitNumber
  public visitNat = this.visitNumber
  public visitFloat = this.visitNumber
  public visitFixedInt = this.visitNumber
  public visitFixedNat = this.visitNumber

  private breakpoints = DEFAULT_LAYOUTS

  private savedY = Object.fromEntries(
    this.breakpoints.map(({ name }) => [name, new Map<number, number>()])
  )

  public visitService(t: IDL.ServiceClass): ServiceLayouts<A> {
    const layouts = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      const category = findCategory(functionName)

      const h = func.accept(this, functionName) as number

      this.breakpoints.forEach(({ name, size }) => {
        const w = 2
        const x = (this.counter * w) % size
        const y = this.savedY[name].get(x) || 0
        const minW = h >= 9 ? 2 : 1

        acc[category][name].push({
          i: functionName,
          x,
          w,
          y,
          h,
          minW,
          minH: h,
        })

        this.savedY[name].set(x, y + h)
      })

      this.counter++

      return acc
    }, DEFAULT_SERVICE_LAYOUTS as ServiceLayouts<A>)

    return layouts
  }
}

const DEFAULT_LAYOUTS = [
  { name: "xl", size: 6 },
  { name: "md", size: 4 },
  { name: "xs", size: 2 },
] as const

const DEFAULT_SERVICE_LAYOUTS = {
  home: Object.fromEntries(DEFAULT_LAYOUTS.map(({ name }) => [name, []])),
  wallet: Object.fromEntries(DEFAULT_LAYOUTS.map(({ name }) => [name, []])),
  governance: Object.fromEntries(DEFAULT_LAYOUTS.map(({ name }) => [name, []])),
  setting: Object.fromEntries(DEFAULT_LAYOUTS.map(({ name }) => [name, []])),
  status: Object.fromEntries(DEFAULT_LAYOUTS.map(({ name }) => [name, []])),
}
