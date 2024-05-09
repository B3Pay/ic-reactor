import { IDL } from "@dfinity/candid"
import { VisitReturnDetails } from "./rets"
import { VisitArgDetails } from "./args"

import type {
  MethodDetail,
  ServiceDetails,
  BaseActor,
  FunctionName,
} from "../types"

export * from "./rets"
export * from "./args"

export class VisitDetails<A = BaseActor> extends IDL.Visitor<
  string,
  ServiceDetails<A> | MethodDetail<A>
> {
  private argsVisitor = new VisitArgDetails<A>()
  private returnsVisitor = new VisitReturnDetails<A>()

  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodDetail<A> {
    const { detail: argDetails, ...restArgs } = this.argsVisitor.visitFunc(
      t,
      functionName
    )
    const { detail: retDetails, ...restRets } = this.returnsVisitor.visitFunc(
      t,
      functionName
    )

    return {
      argDetail: argDetails,
      retDetail: retDetails,
      ...restRets,
      ...restArgs,
    }
  }

  public visitService(t: IDL.ServiceClass): ServiceDetails<A> {
    const methodFields = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodDetail<A>

      return acc
    }, {} as ServiceDetails<A>)

    return methodFields
  }
}
