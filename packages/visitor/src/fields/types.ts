import type { BaseActor, FunctionName } from "../types"
import type { NormalMethodReturns } from "./returns/types"
import type { MethodArgs } from "./args/types"

export * from "./args/types"
export * from "./returns/types"

export type ServiceFields<A = BaseActor> = {
  [K in FunctionName<A>]: MethodFields<A>
}

export interface MethodFields<A = BaseActor>
  extends Omit<MethodArgs<A>, "fields" | "defaultValues">,
    Omit<NormalMethodReturns<A>, "fields" | "defaultValues"> {
  defaultValues: {
    args: MethodArgs<A>["defaultValues"]
    rets: NormalMethodReturns<A>["defaultValues"]
  }
  argFields: MethodArgs<A>["fields"]
  retFields: NormalMethodReturns<A>["fields"]
}
