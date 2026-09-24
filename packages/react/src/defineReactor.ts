// DisplayReactor is only for the deprecated `display: true` path. It is what
// puts DisplayReactor and zod in every bundle that uses defineReactor; drop it
// with that path.
import { DisplayReactor, Reactor } from "@ic-reactor/core"
import type { BaseActor } from "@ic-reactor/core"
import { defineReactorWith } from "./defineReactorShared.js"
import type {
  DefineReactorSharedParameters,
  DefineReactorResult,
} from "./defineReactorShared.js"
import type { DefineDisplayReactorOptions } from "./defineDisplayReactor.js"

export type {
  DefineReactorSharedParameters,
  DefineReactorResult,
} from "./defineReactorShared.js"

/** Parameters for a standard (raw Candid types) reactor. */
export interface DefineReactorParameters extends DefineReactorSharedParameters {
  display?: false
}

/**
 * Parameters for `defineReactor({ display: true })`.
 *
 * @deprecated Call `defineDisplayReactor` with the same options, without
 * `display`: see {@link DefineDisplayReactorOptions}.
 */
export interface DefineDisplayReactorParameters<
  Service,
> extends DefineDisplayReactorOptions<Service> {
  /**
   * @deprecated Use `defineDisplayReactor(...)` instead of
   * `defineReactor({ display: true, ... })`. The flag keeps working until the
   * next major, but it makes every bundle that calls `defineReactor` carry
   * `DisplayReactor` and zod, even when it never sets the flag.
   */
  display: true
}

/**
 * The `display: true` form: builds a DisplayReactor and its hooks.
 *
 * @deprecated `defineReactor({ display: true })` is deprecated: pass the same
 * options, without `display`, to `defineDisplayReactor(...)`. Only this form
 * is; `defineReactor` without `display` builds a plain `Reactor` and is not
 * deprecated. The flag keeps working until the next major, but it makes every
 * bundle that calls `defineReactor` carry `DisplayReactor` and zod, even when
 * it never sets the flag.
 */
export function defineReactor<Service = BaseActor>(
  params: DefineDisplayReactorParameters<Service>
): DefineReactorResult<Service, "display", DisplayReactor<Service>>

/**
 * One-call bootstrap for a canister reactor + its React hooks.
 *
 * Collapses the four manual steps (QueryClient → ClientManager → Reactor →
 * createActorHooks) into a single call. It builds a `Reactor`, which takes and
 * returns raw Candid values; `defineDisplayReactor` takes the same options and
 * builds a `DisplayReactor` for UI-friendly ones.
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
 * const ledger = defineReactor<_LEDGER>({
 *   name: "ledger",
 *   idlFactory: ledgerIdl,
 *   canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
 * })
 * const index = defineReactor<_INDEX>({
 *   name: "index",
 *   idlFactory: indexIdl,
 *   canisterId: "qhbym-qaaaa-aaaaa-aaafq-cai",
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
 *   canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
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
export function defineReactor<Service = BaseActor>(
  params: DefineReactorParameters
): DefineReactorResult<Service, "candid", Reactor<Service, "candid">>

export function defineReactor<Service = BaseActor>(
  params: DefineReactorParameters | DefineDisplayReactorParameters<Service>
):
  | DefineReactorResult<Service, "display", DisplayReactor<Service>>
  | DefineReactorResult<Service, "candid", Reactor<Service, "candid">> {
  if (params.display) {
    // What defineDisplayReactor builds, but under this function's name, so an
    // error names the call the app actually made.
    const { validators } = params
    return defineReactorWith<Service, "display", DisplayReactor<Service>>(
      "defineReactor",
      params,
      (config) => new DisplayReactor<Service>({ ...config, validators })
    )
  }

  return defineReactorWith<Service, "candid", Reactor<Service, "candid">>(
    "defineReactor",
    params,
    (config) => new Reactor<Service>(config)
  )
}
