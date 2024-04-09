import { IDL } from "@dfinity/candid"
import { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"
import { MethodFields, ServiceFields } from "./types"
import { VisitReturnDetails } from "./returns"
import { VisitArgDetails } from "./args"

export * from "./returns"
export * from "./args"

export class VisitDetails<A = BaseActor> extends IDL.Visitor<
  string,
  ServiceFields<A> | MethodFields<A>
> {
  private argsVisitor = new VisitArgDetails<A>()
  private returnsVisitor = new VisitReturnDetails<A>()

  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodFields<A> {
    const { details: argDetails, ...restArgs } = this.argsVisitor.visitFunc(
      t,
      functionName
    )
    const { details: retDetails, ...restRets } = this.returnsVisitor.visitFunc(
      t,
      functionName
    )

    return {
      argDetails,
      retDetails,
      ...restRets,
      ...restArgs,
    }
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
