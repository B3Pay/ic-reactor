import type { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"
import type { MethodReturns } from "./returns/types"
import type { MethodArgs } from "./args/types"

export * from "./args/types"
export * from "./returns/types"

export type ServiceFields<A = BaseActor> = {
  [K in FunctionName<A>]: MethodFields<A>
}

export interface MethodFields<A = BaseActor>
  extends Omit<MethodArgs<A>, "fields" | "defaultValues">,
    Omit<MethodReturns<A>, "fields" | "defaultValues"> {
  defaultValues: {
    args: MethodArgs<A>["defaultValues"]
    rets: MethodReturns<A>["defaultValues"]
  }
  argFields: MethodArgs<A>["fields"]
  retFields: MethodReturns<A>["fields"]
}
