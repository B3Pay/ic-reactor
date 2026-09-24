/**
 * The body `defineReactor` and `defineDisplayReactor` share.
 *
 * It takes the reactor's construction as a callback, so this module imports
 * neither reactor class. That matters for bundle size: `DisplayReactor` builds
 * its codecs on zod, and a module that imported it here would put zod in every
 * app that calls `defineReactor`, whether or not it ever builds a
 * DisplayReactor. Keep it that way — no `DisplayReactor` import in this file.
 */
import { ClientManager, reactorRetry } from "@ic-reactor/core"
import type {
  Reactor,
  TransformKey,
  ReactorParameters,
  ClientManagerParameters,
} from "@ic-reactor/core"
import { QueryClient } from "@tanstack/react-query"
import { createActorHooks, ActorHooks } from "./createActorHooks.js"
import { AuthenticationManager } from "./auth/authentication-manager.js"
import { IdentityAttributesManager } from "./auth/identity-attributes-manager.js"
import { createIdentityAttributeHooks } from "./auth/createIdentityAttributeHooks.js"
import type { UseIdentityAttributesReturn } from "./auth/createIdentityAttributeHooks.js"
import { createAuthHooks } from "./hooks/createAuthHooks.js"
import type { CreateAuthHooksReturn } from "./hooks/createAuthHooks.js"
import type { AuthenticationManagerParameters } from "./auth/authentication-manager.js"
import { registerAuthentication } from "./ownedAuthentication.js"

/** Options shared by both the standard and display variants of defineReactor. */
export interface DefineReactorSharedParameters
  extends
    Omit<ReactorParameters, "clientManager">,
    Omit<ClientManagerParameters, "queryClient"> {
  /**
   * Reuse an existing ClientManager (e.g. to share one agent across canisters).
   * When omitted, a ClientManager is created from the agent options below.
   *
   * A supplied or adopted manager brings its own agent and QueryClient, so
   * `agentOptions`, `queryClient` and `allowEnvConfig` apply only when this
   * call creates one.
   */
  clientManager?: ClientManager
  /**
   * QueryClient for a ClientManager created by this call.
   *
   * Ignored when `clientManager` or `authentication` is supplied — queries run
   * against that manager's own QueryClient, which is what is returned.
   */
  queryClient?: QueryClient
  /**
   * Reuse an existing AuthenticationManager, so several reactors share one
   * Internet Identity session. When omitted, one is created for this reactor.
   *
   * Its `clientManager` is adopted for this reactor, so sign-in updates the
   * same agent the reactor calls through. Supplying a different `clientManager`
   * alongside it is rejected.
   */
  authentication?: AuthenticationManager
  /**
   * Internet Identity options forwarded to the AuthenticationManager
   * (`identityProvider`, `derivationOrigin`, `idleOptions`, `storage`, …).
   *
   * Not every option reaches both `@icp-sdk/auth` majors. `idleOptions`,
   * `storage`, `keyType` and `identity` are honoured only by v8: v10 has no
   * equivalent, so IC Reactor drops each with a one-time warning. For idle
   * handling on v10, pass `maxTimeToIdle` to `login()` and set
   * `disableBrowserActivity` here. `disableBrowserActivity` is v10-only.
   *
   * Mutually exclusive with `authentication`: a manager built elsewhere is
   * already configured, so these could not be applied to it.
   */
  auth?: Omit<AuthenticationManagerParameters, "clientManager">
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

/**
 * The QueryClient this module creates when the caller does not supply one.
 *
 * React Query retries every failure three times by default, which for canister
 * calls means four attempts and several seconds of backoff on outcomes that
 * cannot change — a canister `Err`, a validation failure, a Candid encode
 * error that never reached the network. `reactorRetry` keeps the same three
 * attempts for transport failures and stops immediately on the rest.
 *
 * A caller-supplied `queryClient` is left exactly as given; opt in there with
 * `defaultOptions: { queries: { retry: reactorRetry } }`.
 */
const createDefaultQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: reactorRetry } },
  })

/**
 * Builds the ClientManager, the reactor `createReactor` returns, its hooks and
 * the lazily created auth managers, for `defineReactor` and
 * `defineDisplayReactor`. Not part of the public API.
 *
 * `caller` is the function the app called; the errors below name it, so an
 * app that called `defineDisplayReactor` is not sent looking for a
 * `defineReactor` call it never made.
 *
 * @internal
 */
export function defineReactorWith<
  Service,
  Transform extends TransformKey,
  R extends Reactor<Service, Transform>,
>(
  caller: "defineReactor" | "defineDisplayReactor",
  params: DefineReactorSharedParameters,
  createReactor: (config: ReactorParameters) => R
): DefineReactorResult<Service, Transform, R> {
  const {
    clientManager: providedClientManager,
    queryClient: providedQueryClient,
    authentication: providedAuthentication,
    auth,
    agentOptions,
    allowEnvConfig,
    allowEnvRootKey,
    name,
    idlFactory,
    canisterId,
    pollingOptions,
  } = params

  // A shared AuthenticationManager updates the identity on its own
  // ClientManager. Giving this reactor a different one would leave its calls
  // anonymous after sign-in, so adopt the manager's rather than building a new
  // one, and refuse an explicit mismatch instead of splitting them silently.
  if (
    providedClientManager &&
    providedAuthentication &&
    providedAuthentication.clientManager !== providedClientManager
  ) {
    throw new Error(
      `[ic-reactor] ${caller}("${name}") received an \`authentication\` manager bound to a different \`clientManager\`. ` +
        `Sign-in would update the authentication manager's agent while this reactor calls through another one, ` +
        `leaving its calls anonymous. Pass \`clientManager: authentication.clientManager\`, or omit \`clientManager\` to adopt it.`
    )
  }

  // `auth` configures a manager this call would build; an existing one is
  // already constructed, so these options could only be dropped on the floor.
  if (providedAuthentication && auth) {
    throw new Error(
      `[ic-reactor] ${caller}("${name}") received both \`authentication\` and \`auth\`. ` +
        `The supplied manager is already configured, so \`auth\` (${Object.keys(auth).join(", ")}) would be ignored. ` +
        `Pass those options where that AuthenticationManager is created, or drop \`authentication\` to build one here.`
    )
  }

  // Same reasoning as `auth`, and it matters more here: an ignored
  // `allowEnvConfig: false` reads as "I locked the cookie out" while the
  // supplied manager carries whatever decision it was built with.
  if (
    (providedClientManager || providedAuthentication) &&
    (allowEnvConfig !== undefined || allowEnvRootKey !== undefined)
  ) {
    const passed = [
      allowEnvConfig !== undefined && "allowEnvConfig",
      allowEnvRootKey !== undefined && "allowEnvRootKey",
    ]
      .filter(Boolean)
      .join(", ")
    throw new Error(
      `[ic-reactor] ${caller}("${name}") received both a ClientManager and \`${passed}\`. ` +
        `That option is resolved when a ClientManager is constructed, so the supplied one already carries its own ` +
        `decision and this would be ignored — silently changing nothing about whether the ic_env cookie is trusted. ` +
        `Pass it where that ClientManager is created, or drop \`clientManager\` to build one here.`
    )
  }

  const clientManager =
    providedClientManager ??
    providedAuthentication?.clientManager ??
    new ClientManager({
      queryClient: providedQueryClient ?? createDefaultQueryClient(),
      agentOptions,
      // Forwarded, not dropped: the type has always accepted these (it extends
      // ClientManagerParameters) while the call ignored them, so the one
      // documented setup path silently discarded the ic_env opt-in it advertised.
      allowEnvConfig,
      allowEnvRootKey,
    })

  // Always report the QueryClient actually in use: when a ClientManager is
  // supplied or adopted, its own QueryClient is the one queries run against.
  const queryClient = clientManager.queryClient

  const reactor = createReactor({
    clientManager,
    name,
    idlFactory,
    canisterId,
    pollingOptions,
  })

  const hooks = createActorHooks<Service, Transform>(reactor)

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

  const result: DefineReactorResult<Service, Transform, R> = {
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

  // For `createReactorProvider`, which disposes the manager this result
  // builds when its tree unmounts. It reads the manager without the getter
  // above, so a tree that never touched authentication does not build one
  // just to release it. A supplied manager is not this result's to release.
  registerAuthentication(result, () =>
    providedAuthentication ? undefined : authenticationInstance
  )

  return result
}
