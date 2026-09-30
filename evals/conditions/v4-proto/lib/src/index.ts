/**
 * @ic-reactor/v4-proto — typed, mode-gated handles for Internet Computer
 * canister methods that produce TanStack Query options.
 *
 *   const client = createClient({ network, identity } | { network, auth })
 *   const ledger = client.canister(LedgerService, { id })
 *   useQuery(ledger.icrc1_balance_of.queryOptions([account]))   // reads only
 *   await ledger.icrc1_balance_of.certified([account])           // plain queries only
 *   useMutation(ledger.icrc1_transfer.mutationOptions({ invalidates: [ledger.icrc1_balance_of] }))
 *   await ledger.icrc1_transfer([arg])                           // direct call
 */
export { createClient } from "./client.js"
export type { AuthSource, Client, ClientOptions, Network } from "./client.js"
export { defineService } from "./service.js"
export type { ActorShape, ModeMap, ServiceDef } from "./service.js"
export { isPrincipalText, principal } from "./principal.js"
export type { PrincipalText, Textify } from "./principal.js"
export { isReactorError } from "./errors.js"
export type {
  ReactorError,
  ReactorErrorKind,
  ReactorFailure,
} from "./errors.js"
export type {
  Canister,
  CompositeQueryHandle,
  HandleArgs,
  HandleData,
  HandleErr,
  HandleMutationOptions,
  HandleQueryOptions,
  MutationConfig,
  QueryHandle,
  ReadHandle,
  UpdateHandle,
} from "./types.js"
