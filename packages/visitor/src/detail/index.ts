import { IDL } from "@dfinity/candid"
import { VisitReturnDetail } from "./rets"
import { VisitArgDetail } from "./args"

import type {
  MethodDetail,
  ServiceDetail,
  BaseActor,
  FunctionName,
} from "../types"

export * from "./rets"
export * from "./args"

export class VisitDetail<A = BaseActor> extends IDL.Visitor<
  string,
  ServiceDetail<A> | MethodDetail<A>
> {
  private argsVisitor = new VisitArgDetail<A>()
  private returnsVisitor = new VisitReturnDetail<A>()

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

  public visitService(t: IDL.ServiceClass): ServiceDetail<A> {
    const methodFields = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodDetail<A>

      return acc
    }, {} as ServiceDetail<A>)

    return methodFields
  }
}
