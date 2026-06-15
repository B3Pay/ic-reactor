/**
 * defineReactor - One-call bootstrap for a canister reactor + its React hooks.
 *
 * Collapses the four manual steps (QueryClient → ClientManager → Reactor →
 * createActorHooks) into a single call, and turns the Reactor / DisplayReactor
 * choice into a `display` flag.
 *
 * @example
 * ```typescript
 * import { defineReactor } from "@ic-reactor/react"
 * import { idlFactory, type _SERVICE } from "./declarations/backend"
 *
 * const { reactor, useActorQuery, useActorMutation } = defineReactor<_SERVICE>({
 *   name: "backend",
 *   idlFactory,
 *   canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
 *   display: true, // ⇒ DisplayReactor (string principals/bigints)
 * })
 *
 * function Profile() {
 *   const { data } = useActorQuery({ functionName: "get_profile" })
 *   return <div>{data?.name}</div>
 * }
 * ```
 *
 * @example Reuse an existing ClientManager (multiple canisters share one agent)
 * ```typescript
 * const ledger = defineReactor<_LEDGER>({ name: "ledger", idlFactory: ledgerIdl })
 * const index = defineReactor<_INDEX>({
 *   name: "index",
 *   idlFactory: indexIdl,
 *   clientManager: ledger.clientManager,
 * })
 * ```
 */
import { ClientManager, Reactor, DisplayReactor } from "@ic-reactor/core"
import type {
  BaseActor,
  TransformKey,
  ReactorParameters,
  ClientManagerParameters,
  DisplayReactorParameters,
} from "@ic-reactor/core"
import { QueryClient } from "@tanstack/react-query"
import { createActorHooks, ActorHooks } from "./createActorHooks"

/** Options shared by both the standard and display variants of defineReactor. */
export interface DefineReactorSharedParameters
  extends
    Omit<ReactorParameters, "clientManager">,
    Omit<ClientManagerParameters, "queryClient"> {
  /**
   * Reuse an existing ClientManager (e.g. to share one agent across canisters).
   * When omitted, a ClientManager is created from the agent options below.
   */
  clientManager?: ClientManager
  /**
   * Reuse an existing QueryClient. When omitted, the provided ClientManager's
   * QueryClient is reused, or a new one is created.
   */
  queryClient?: QueryClient
}

/** Parameters for a standard (raw Candid types) reactor. */
export interface DefineReactorParameters extends DefineReactorSharedParameters {
  display?: false
}

/** Parameters for a DisplayReactor (UI-friendly string principals/bigints). */
export interface DefineDisplayReactorParameters<
  Service,
> extends DefineReactorSharedParameters {
  display: true
  /** Optional initial argument validators (receive display types). */
  validators?: DisplayReactorParameters<Service>["validators"]
}

/** The reactor instance plus its bound hooks and shared infrastructure. */
export type DefineReactorResult<
  Service,
  Transform extends TransformKey,
  R extends Reactor<Service, Transform>,
> = ActorHooks<Service, Transform> & {
  reactor: R
  clientManager: ClientManager
  queryClient: QueryClient
}

export function defineReactor<Service = BaseActor>(
  params: DefineDisplayReactorParameters<Service>
): DefineReactorResult<Service, "display", DisplayReactor<Service>>

export function defineReactor<Service = BaseActor>(
  params: DefineReactorParameters
): DefineReactorResult<Service, "candid", Reactor<Service, "candid">>

export function defineReactor<Service = BaseActor>(
  params: DefineReactorParameters | DefineDisplayReactorParameters<Service>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): DefineReactorResult<Service, any, any> {
  const {
    clientManager: providedClientManager,
    queryClient: providedQueryClient,
    display,
    agentOptions,
    name,
    idlFactory,
    canisterId,
    pollingOptions,
  } = params as DefineDisplayReactorParameters<Service>

  const queryClient =
    providedQueryClient ??
    providedClientManager?.queryClient ??
    new QueryClient()

  const clientManager =
    providedClientManager ??
    new ClientManager({
      queryClient,
      agentOptions,
    })

  const reactorConfig = {
    clientManager,
    name,
    idlFactory,
    canisterId,
    pollingOptions,
  }

  // The Reactor / DisplayReactor union cannot be expressed through the shared
  // implementation signature, so the body is intentionally untyped here; the
  // public overloads above carry the precise types for callers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reactor: any = display
    ? new DisplayReactor<Service>({
        ...reactorConfig,
        validators: (params as DefineDisplayReactorParameters<Service>)
          .validators,
      })
    : new Reactor<Service>(reactorConfig)

  const hooks = createActorHooks(reactor)

  return { ...hooks, reactor, clientManager, queryClient }
}
