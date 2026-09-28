// `./declarations/backend` of the package pages: everything the default app's
// canister declares, plus the `get_user` its codegen examples call and the
// `register_finish` an OpenID sign-up ends with, and the entry codegen writes
// for that service (`index.generated.ts` and `index.factories.generated.ts`
// of the codegen page).
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import {
  DisplayReactor,
  createActorHooks,
  createMutation,
  createQuery,
  createQueryFactory,
} from "@ic-reactor/react"
import { clientManager } from "../../../app/clients"
import type { _SERVICE as AppService } from "../../../app/declarations/backend"
import { canisterId, idlFactory } from "../../../app/declarations/backend"

export * from "../../../app/declarations/backend"

export interface _SERVICE extends AppService {
  get_user: ActorMethod<[Principal], [] | [string]>
  register_finish: ActorMethod<
    [{ data: Uint8Array; signature: Uint8Array }],
    undefined
  >
}

// index.generated.ts
export type BackendService = _SERVICE
export const backendReactor = new DisplayReactor<BackendService>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId,
})
export const {
  useActorQuery: useBackendQuery,
  useActorSuspenseQuery: useBackendSuspenseQuery,
  useActorInfiniteQuery: useBackendInfiniteQuery,
  useActorSuspenseInfiniteQuery: useBackendSuspenseInfiniteQuery,
  useActorMutation: useBackendMutation,
  useActorMethod: useBackendMethod,
} = createActorHooks(backendReactor)

// index.factories.generated.ts
export const getMessageQuery = createQuery(backendReactor, {
  functionName: "get_message",
})
export const getUserQuery = createQueryFactory(backendReactor, {
  functionName: "get_user",
})
export const setMessageMutation = createMutation(backendReactor, {
  functionName: "set_message",
})
