/**
 * defineReactor - One-call bootstrap for a canister reactor + its React hooks.
 *
 * Collapses the four manual steps (QueryClient → ClientManager → Reactor →
 * createActorHooks) into a single call, and turns the Reactor / DisplayReactor
 * choice into a `display` flag.
 * Use this when one-call bootstrap is enough. If you need reusable
 * method-specific operations outside React, compose with query/mutation
 * factories after setup.
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
 *   authentication: ledger.authentication, // one Internet Identity session
 * })
 * ```
 *
 * @example Internet Identity is wired up out of the box
 * ```typescript
 * const { useAuth, useIdentityAttributes } = defineReactor<_SERVICE>({
 *   name: "backend",
 *   idlFactory,
 *   // Needed when the app is served from more than one origin.
 *   auth: { derivationOrigin: "https://app.example.com" },
 * })
 *
 * function LoginButton() {
 *   const { login, logout, isAuthenticated, principal } = useAuth()
 *   return isAuthenticated
 *     ? <button onClick={() => logout()}>{principal?.toText()}</button>
 *     : <button onClick={() => login()}>Sign in</button>
 * }
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
import { AuthenticationManager } from "./auth/authentication-manager"
import { IdentityAttributesManager } from "./auth/identity-attributes-manager"
import { createIdentityAttributeHooks } from "./auth/createIdentityAttributeHooks"
import type { UseIdentityAttributesReturn } from "./auth/createIdentityAttributeHooks"
import { createAuthHooks } from "./hooks/createAuthHooks"
import type { CreateAuthHooksReturn } from "./hooks/createAuthHooks"
import type { AuthenticationManagerParameters } from "./auth/authentication-manager"

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
  /**
   * Reuse an existing AuthenticationManager, so several reactors share one
   * Internet Identity session. When omitted, one is created for this reactor.
   */
  authentication?: AuthenticationManager
  /**
   * Internet Identity options forwarded to the AuthenticationManager
   * (`identityProvider`, `derivationOrigin`, `idleOptions`, `storage`, …).
   */
  auth?: Omit<AuthenticationManagerParameters, "clientManager">
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
> = ActorHooks<Service, Transform> &
  CreateAuthHooksReturn & {
    reactor: R
    clientManager: ClientManager
    queryClient: QueryClient
    /** Internet Identity session manager backing `useAuth`. */
    authentication: AuthenticationManager
    /** Signed identity attribute requests backing `useIdentityAttributes`. */
    identityAttributes: IdentityAttributesManager
    useIdentityAttributes: () => UseIdentityAttributesReturn
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
    authentication: providedAuthentication,
    auth,
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

  // Auth is built on first use. `AuthenticationManager` dynamically imports the
  // optional `@icp-sdk/auth` peer as soon as it is constructed, and reactors
  // that never touch authentication should not pay for that.
  let authenticationInstance: AuthenticationManager | undefined
  const getAuthentication = () =>
    (authenticationInstance ??=
      providedAuthentication ??
      new AuthenticationManager({ ...auth, clientManager }))

  let identityAttributesInstance: IdentityAttributesManager | undefined
  const getIdentityAttributes = () =>
    (identityAttributesInstance ??= new IdentityAttributesManager(
      getAuthentication()
    ))

  let authHooks: CreateAuthHooksReturn | undefined
  const getAuthHooks = () =>
    (authHooks ??= createAuthHooks(getAuthentication()))

  let attributeHooks:
    ReturnType<typeof createIdentityAttributeHooks> | undefined
  const getAttributeHooks = () =>
    (attributeHooks ??= createIdentityAttributeHooks(getIdentityAttributes()))

  return {
    ...hooks,
    reactor,
    clientManager,
    queryClient,
    // Stable wrappers: the hook call order inside them never changes, so the
    // rules of hooks still hold.
    useAuth: () => getAuthHooks().useAuth(),
    useAgentState: () => getAuthHooks().useAgentState(),
    useUserPrincipal: () => getAuthHooks().useUserPrincipal(),
    useIdentityAttributes: () => getAttributeHooks().useIdentityAttributes(),
    get authentication() {
      return getAuthentication()
    },
    get identityAttributes() {
      return getIdentityAttributes()
    },
  }
}
