import { IDL } from "@dfinity/candid"
import { VisitReturns } from "./returns"
import { VisitArgs } from "./args"

import type {
  BaseActor,
  FunctionName,
  MethodFields,
  NormalMethodReturns,
  ServiceFields,
} from "../types"

export * from "./returns"
export * from "./args"

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
      fields: argFields,
      defaultValues: argDefaultValues,
      ...restArgs
    } = this.argsVisitor.visitFunc(t, functionName)
    const {
      fields: retFields,
      defaultValues: retDefaultValues,
      ...restRets
    } = this.returnsVisitor.visitFunc(t, functionName) as NormalMethodReturns<A>

    return {
      argFields,
      retFields,
      defaultValues: {
        args: argDefaultValues,
        rets: retDefaultValues,
      },
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
