import { IDL } from "@dfinity/candid"
import { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"
import { MethodFields, ServiceFields } from "./types"
import { VisitReturns } from "./returns"
import { VisitArgs } from "./args"

export class VisitFields<A = BaseActor> extends IDL.Visitor<
  string,
  ServiceFields<A> | MethodFields<A>
> {
  private argsVisitor = new VisitArgs<A>()
  private returnsVisitor = new VisitReturns<A>()

  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodFields<A> {
    const {
      defaultValues,
      fields: argFields,
      ...restArgs
    } = this.argsVisitor.visitFunc(t, functionName)
    const { fields: retFields, ...restRets } = this.returnsVisitor.visitFunc(
      t,
      functionName
    )

    return { retFields, argFields, defaultValues, ...restArgs, ...restRets }
  }

  public visitService(t: IDL.ServiceClass): ServiceFields<A> {
    const methodFields = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodFields<A>

      return acc
    }, {} as ServiceFields<A>)

    return methodFields
  }
}
