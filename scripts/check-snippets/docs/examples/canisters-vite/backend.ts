// `./canisters-vite/backend` of the codegen-in-action demo: what the Vite
// plugin writes for its `backend.did` (one query, `get`, and two update
// methods, `inc` and `add`), with `factories: true`.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import { DisplayReactor, createMutation, createQuery } from "@ic-reactor/react"
import { clientManager } from "../../../app/clients"

export interface _SERVICE {
  add: ActorMethod<[bigint], undefined>
  get: ActorMethod<[], bigint>
  inc: ActorMethod<[], undefined>
}
export declare const idlFactory: IDL.InterfaceFactory

// index.generated.ts
export const backendReactor = new DisplayReactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
})

// index.factories.generated.ts
export const addMutation = createMutation(backendReactor, {
  functionName: "add",
})
export const getQuery = createQuery(backendReactor, { functionName: "get" })
export const incMutation = createMutation(backendReactor, {
  functionName: "inc",
})
