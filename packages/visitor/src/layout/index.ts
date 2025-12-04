import { IDL } from "@icp-sdk/core/candid"
import { findCategory } from "../helpers"
import { CategoryTest, DEFAULT_CATEGORIES, DEFAULT_LAYOUTS } from "../constants"

import type { BaseActor, FunctionName, ServiceLayout } from "../types"
/**
 * Visit the candid file and extract the details.
 * It returns the extracted service details.
 *
 */
export class VisitLayout<A = BaseActor> extends IDL.Visitor<
  CategoryTest[] | string,
  ServiceLayout<A> | number | void
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

  private generateSavedY = (categoryTest?: CategoryTest[] | string) => {
    const categories = categoryTest
      ? Array.isArray(categoryTest)
        ? categoryTest.map((category) => category.name)
        : [categoryTest]
      : DEFAULT_CATEGORIES

    return Object.fromEntries(
      categories.map((category) => [
        category,
        Object.fromEntries(
          DEFAULT_LAYOUTS.map(({ name }) => [name, new Map<number, number>()])
        ),
      ])
    )
  }

  private generateDefaultLayout = (
    categoryTest?: CategoryTest[] | string
  ): ServiceLayout<A> => {
    const categories = categoryTest
      ? Array.isArray(categoryTest)
        ? categoryTest.map((category) => category.name)
        : [categoryTest]
      : DEFAULT_CATEGORIES

    return categories.reduce(
      (acc, category) => ({
        ...acc,
        [category as string]: Object.fromEntries(
          DEFAULT_LAYOUTS.map(({ name }) => [name, []])
        ),
      }),
      {}
    )
  }

  public visitService(
    t: IDL.ServiceClass,
    categoryTest?: CategoryTest[] | string
  ): ServiceLayout<A> {
    const detaultLayout = this.generateDefaultLayout(categoryTest)
    const defaultSavedY = this.generateSavedY(categoryTest)

    const layouts = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      const category = findCategory(functionName, categoryTest)

      const h = func.accept(this, functionName) as number

      this.breakpoints.forEach(({ name, size }) => {
        const length = acc[category][name].length
        const w = 2
        const x = (length * w) % size
        const y = defaultSavedY[category][name].get(x) || 0
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

        defaultSavedY[category][name].set(x, y + h)
      })

      this.counter++

      return acc
    }, detaultLayout)

    return layouts
  }
}
