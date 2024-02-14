import { IDL } from "@dfinity/candid"
import {
  DefaultActorType,
  ExtractActorMethodReturnType,
  FunctionName,
} from "@ic-reactor/store"
import { ExtractFields } from "./fields"

// export type ExtractedService<
//   A = DefaultActorType,
//   M extends FunctionName<A> = FunctionName<A>
// > = {
//   [K in M]: <
//     Method extends M,
//     Visitor extends IDL.Visitor<any, any> = ExtractFields<A>
//   >(
//     extractorClass?: Visitor,
//     data?: ExtractActorMethodReturnType<A[Method]>
//   ) => ReturnType<Visitor["visitFunc"]>
// }

export type ExtractedService<
  A = DefaultActorType,
  M extends FunctionName<A> = FunctionName<A>
> = {
  [K in M]: <Visitor extends IDL.Visitor<any, any>>(
    extractorClass: Visitor,
    data?: Parameters<Visitor["visitFunc"]>[1]
  ) => ReturnType<Visitor["visitFunc"]>
}
