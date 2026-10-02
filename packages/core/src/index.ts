/**
 * `@ic-reactor/core` 4: the thin layer over a `candid-core-cli gen` module.
 *
 * The public surface is added slice by slice (milestone 1, #790): the error
 * union, network resolution, units, the client and its canister builders.
 *
 * @packageDocumentation
 */
export type { Network } from "./network.js"
export {
  createClient,
  type AuthLike,
  type AuthState,
  type Client,
  type ClientOptions,
} from "./client.js"
export {
  isReactorError,
  type ReactorError,
  type ReactorErrorKind,
} from "./errors.js"
export type { Canister, CanisterTarget } from "./types.js"
export { formatUnits, parseUnits } from "./units.js"
