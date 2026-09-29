// `./declarations/backend` of the getting-started pages: the canister their
// examples call, as `@ic-reactor/vite-plugin` (or the CLI) generates it in
// `src/declarations/backend/`. It greets, keeps a counter, and holds token
// balances with a `transfer` that returns a Candid `Result`. It holds what the
// declarations export, plus what the generated `index.ts` exports for it:
// `useBackendQuery`, `useBackendMutation` and the other bound hooks of a
// reactor over the app's `src/clients.ts` `clientManager`.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import { DisplayReactor, createActorHooks } from "@ic-reactor/react"
import { clientManager } from "../clients"

export interface _SERVICE {
  greet: ActorMethod<[string], string>
  get_count: ActorMethod<[], bigint>
  increment: ActorMethod<[], bigint>
  get_balance: ActorMethod<[Principal], bigint>
  transfer: ActorMethod<
    [{ to: Principal; amount: bigint }],
    { Ok: bigint } | { Err: string }
  >
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

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
