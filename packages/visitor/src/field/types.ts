import type { BaseActor, FunctionName } from "../types"
import type { NormalMethodReturn } from "./rets/types"
import type { MethodArg } from "./args/types"

export * from "./args/types"
export * from "./rets/types"

export type ServiceField<A = BaseActor> = {
  [K in FunctionName<A>]: MethodField<A>
}

export interface MethodField<A = BaseActor>
  extends Omit<MethodArg<A>, "fields" | "defaultValues">,
    Omit<NormalMethodReturn<A>, "fields" | "defaultValues"> {
  defaultValues: {
    args: MethodArg<A>["defaultValues"]
    rets: NormalMethodReturn<A>["defaultValues"]
  }
  argField: MethodArg<A>["fields"]
  retField: NormalMethodReturn<A>["fields"]
}
