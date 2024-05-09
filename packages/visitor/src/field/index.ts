import { IDL } from "@dfinity/candid"
import { VisitReturn } from "./rets"
import { VisitArg } from "./args"

import type {
  BaseActor,
  FunctionName,
  MethodField,
  NormalMethodReturn,
  ServiceField,
} from "../types"

export * from "./rets"
export * from "./args"

export class VisitField<A = BaseActor> extends IDL.Visitor<
  string,
  ServiceField<A> | MethodField<A>
> {
  private argsVisitor = new VisitArg<A>()
  private returnsVisitor = new VisitReturn<A>()

  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodField<A> {
    const {
      fields: argFields,
      defaultValues: argDefaultValues,
      ...restArgs
    } = this.argsVisitor.visitFunc(t, functionName)
    const {
      fields: retFields,
      defaultValues: retDefaultValues,
      ...restRets
    } = this.returnsVisitor.visitFunc(t, functionName) as NormalMethodReturn<A>

    return {
      argField: argFields,
      retField: retFields,
      defaultValues: {
        args: argDefaultValues,
        rets: retDefaultValues,
      },
      ...restRets,
      ...restArgs,
    }
  }

  public visitService(t: IDL.ServiceClass): ServiceField<A> {
    const methodFields = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodField<A>

      return acc
    }, {} as ServiceField<A>)

    return methodFields
  }
}
