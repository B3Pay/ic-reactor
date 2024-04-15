import type { ServiceLayouts } from "./types"
import { IDL } from "@dfinity/candid"
import { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"
import { findCategory } from "./helpers"
import { DEFAULT_CATEGORIES, DEFAULT_LAYOUTS } from "./constants"

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
    this.height = 10
    t.argTypes.forEach((arg, index) => {
      this.height += 4
      arg.accept(this, `__arg${index}`)
    })

    return this.height + 4
  }

  public visitRecord(_t: IDL.RecordClass, _fields: Array<[string, IDL.Type]>) {
    _fields.forEach(([key, type]) => {
      this.height += 4
      type.accept(this, key)
    })
  }

  public visitVariant(
    _t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>
  ) {
    this.height += 4
    let saveHeight = this.height

    _fields.forEach(([key, type], index) => {
      type.accept(this, key)
      saveHeight = index === 0 ? this.height + 4 : saveHeight
    })

    this.height = saveHeight
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[]
  ) {
    components.forEach((type, index) => {
      this.height += 4
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
    this.height += 4
  }

  public visitText(_t: IDL.TextClass) {
    this.height += 4
  }

  public visitNumber<T>(_t: IDL.Type<T>) {
    this.height += 4
  }

  public visitInt = this.visitNumber
  public visitNat = this.visitNumber
  public visitFloat = this.visitNumber
  public visitFixedInt = this.visitNumber
  public visitFixedNat = this.visitNumber

  private breakpoints = DEFAULT_LAYOUTS

  private savedY = Object.fromEntries(
    DEFAULT_CATEGORIES.map((category) => [
      category,
      Object.fromEntries(
        DEFAULT_LAYOUTS.map(({ name }) => [name, new Map<number, number>()])
      ),
    ])
  )

  private DEFAULTLAYOUT = DEFAULT_CATEGORIES.reduce(
    (acc, category) => ({
      ...acc,
      [category]: Object.fromEntries(
        DEFAULT_LAYOUTS.map(({ name }) => [name, []])
      ),
    }),
    {}
  )

  public visitService(t: IDL.ServiceClass): ServiceLayouts<A> {
    const layouts = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      const category = findCategory(functionName)

      const h = func.accept(this, functionName) as number

      this.breakpoints.forEach(({ name, size }) => {
        const length = acc[category][name].length
        const w = 2
        const x = (length * w) % size
        const y = this.savedY[category][name].get(x) || 0
        const minW = h >= 18 ? 2 : 1

        acc[category][name].push({
          i: functionName,
          x,
          w,
          y,
          h,
          minW,
          minH: h,
        })

        this.savedY[category][name].set(x, y + h)
      })

      this.counter++

      return acc
    }, this.DEFAULTLAYOUT as ServiceLayouts<A>)

    return layouts
  }
}
