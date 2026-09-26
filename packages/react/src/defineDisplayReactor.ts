import { DisplayReactor } from "@ic-reactor/core"
import type { BaseActor, DisplayReactorParameters } from "@ic-reactor/core"
import { defineReactorWith } from "./defineReactorShared.js"
import type {
  DefineReactorSharedParameters,
  DefineReactorResult,
} from "./defineReactorShared.js"

/** Options for {@link defineDisplayReactor}: `defineReactor`'s, plus validators. */
export interface DefineDisplayReactorOptions<
  Service,
> extends DefineReactorSharedParameters {
  /** Optional initial argument validators (receive display types). */
  validators?: DisplayReactorParameters<Service>["validators"]
}

/**
 * One-call bootstrap for a {@link DisplayReactor} and its React hooks: the
 * display counterpart of `defineReactor`, taking the same options.
 *
 * A DisplayReactor takes and returns UI-friendly values — text for
 * `Principal`, `nat`, `int` and 64-bit integers, hex for blobs — which suits
 * forms and components. Its codecs are built on zod, so this adds zod to the
 * bundle. `defineReactor`, which builds a plain `Reactor` with raw Candid
 * values, does not need zod, but until its deprecated `display` flag is removed
 * at the next major it bundles zod anyway; `createActorHooks(new Reactor(...))`
 * is the setup without it.
 *
 * Replaces `defineReactor({ display: true })`, which is deprecated.
 *
 * @example
 * ```typescript
 * import { defineDisplayReactor } from "@ic-reactor/react"
 * import { idlFactory, type _SERVICE } from "./declarations/backend"
 *
 * export const { reactor, useActorQuery, useActorMutation, useAuth } =
 *   defineDisplayReactor<_SERVICE>({
 *     name: "backend",
 *     idlFactory,
 *     canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
 *   })
 *
 * function Balance() {
 *   // `nat` arrives as text, ready to render.
 *   const { data } = useActorQuery({ functionName: "get_balance" })
 *   return <span>{data}</span>
 * }
 * ```
 */
export function defineDisplayReactor<Service = BaseActor>(
  params: DefineDisplayReactorOptions<Service>
): DefineReactorResult<Service, "display", DisplayReactor<Service>> {
  return defineReactorWith<Service, "display", DisplayReactor<Service>>(
    "defineDisplayReactor",
    params,
    (config) =>
      new DisplayReactor<Service>({
        ...config,
        validators: params.validators,
      })
  )
}
