import type { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"
import type { MethodReturnDetails } from "./returns/types"
import type { MethodArgDetails } from "./args/types"

export * from "./args/types"
export * from "./returns/types"

export type FunctionCategory = "home" | "wallet" | "governance" | "setting"

export type ServiceFields<A = BaseActor> = {
  [K in FunctionName<A>]: MethodFields<A>
}

export interface MethodFields<A = BaseActor>
  extends Omit<MethodArgDetails<A>, "details" | "defaultValues">,
    Omit<MethodReturnDetails<A>, "details" | "defaultValues"> {
  argDetails: MethodArgDetails<A>["details"]
  retDetails: MethodReturnDetails<A>["details"]
}
