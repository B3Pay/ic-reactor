import type { IDL } from "@dfinity/candid"
import type {
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core/dist/types"
import type { AllReturnTypes, ReturnMethodFieldValues } from "./returns/types"
import type { AllArgTypes, ArgsDefaultValues } from "./args/types"

export type ServiceFields<A = BaseActor> = {
  [K in FunctionName<A>]: MethodFields<A>
}

export interface MethodFields<A = BaseActor> {
  functionName: FunctionName<A>
  functionType: FunctionType
  argFields: AllArgTypes<IDL.Type>[] | []
  retFields: AllReturnTypes<IDL.Type>[] | []
  transformData: (data: unknown | unknown[]) => ReturnMethodFieldValues<A>
  validateAndReturnArgs: (
    data: ArgsDefaultValues<A>
  ) => ArgsDefaultValues<A>[FunctionName<A>][keyof ArgsDefaultValues<A>[FunctionName<A>]][]
  defaultValues: ArgsDefaultValues<A>
}
