// `./lib/canisters/backend` of the vite-plugin demo: the entry the Vite plugin
// writes under `outDir` for its `backend` canister (`greet`, `getCount` and
// `increment`), with its six hooks named after the canister.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import { DisplayReactor, createActorHooks } from "@ic-reactor/react"
import { clientManager } from "../../../../app/clients"

export interface _SERVICE {
  getCount: ActorMethod<[], bigint>
  greet: ActorMethod<[string], string>
  increment: ActorMethod<[], bigint>
}
export declare const idlFactory: IDL.InterfaceFactory

// index.generated.ts
export type BackendService = _SERVICE
export const backendReactor = new DisplayReactor<BackendService>({
  clientManager,
  idlFactory,
  name: "backend",
})
export const {
  useActorQuery: useBackendQuery,
  useActorSuspenseQuery: useBackendSuspenseQuery,
  useActorInfiniteQuery: useBackendInfiniteQuery,
  useActorSuspenseInfiniteQuery: useBackendSuspenseInfiniteQuery,
  useActorMutation: useBackendMutation,
  useActorMethod: useBackendMethod,
} = createActorHooks(backendReactor)
