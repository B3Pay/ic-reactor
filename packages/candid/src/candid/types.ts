import { IDL } from "@dfinity/candid"
import { DefaultActorType, FunctionName } from "@ic-reactor/store"

export type ExtractedService<A = DefaultActorType> = {
  [K in FunctionName<A>]: <ExtractorClass extends IDL.Visitor<any, any>>(
    extractorClass?: ExtractorClass
  ) => IDL.Visitor<string, any>
}
