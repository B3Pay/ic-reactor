/**
 * The effective canister id of a call to the management canister (`aaaaa-aa`).
 *
 * A request is routed by its *effective* canister id: the subnet that holds it
 * takes the request. For an ordinary canister that is the canister itself. The
 * management canister lives on every subnet, so a call to it has to name the
 * canister it is about. The IC interface specification, section "Effective
 * canister id" (`#http-effective-canister-id`, dfinity/portal
 * `docs/references/ic-interface-spec.md` at fe646b2), says:
 *
 * > If the request is an update call to the Management Canister (`aaaaa-aa`):
 * > if the call is to the `create_canister` or
 * > `provisional_create_canister_with_cycles` method, then any principal can be
 * > used as the effective canister id for this call. If the call is to the
 * > `install_chunked_code` method and the `arg` is a Candid-encoded record with
 * > a `target_canister` field of type `principal`, then the effective canister
 * > id must be that principal. Otherwise, if the `arg` is a Candid-encoded
 * > record with a `canister_id` field of type `principal`, then the effective
 * > canister id must be that principal. Otherwise, the call is rejected by the
 * > system independently of the effective canister id.
 *
 * and the same for a query call, with `list_canisters` as the method that
 * takes any principal. It adds that "the effective canister id of a request
 * submitted to a node must be a canister id from the canister ranges of the
 * subnet to which the node belongs": "any principal" is any principal *of the
 * right subnet*, which a client cannot know.
 *
 * So the client routes by an explicit table, one row per method, and refuses
 * before sending (`invalid_args`, code `"effective_canister_id_unknown"`) every
 * call it has no row for, and every call whose row names a field the arguments
 * leave empty:
 *
 * - `canister_id`: the methods an external caller can send whose argument is a
 *   record with a `canister_id : principal` field.
 * - `target_canister`: `install_chunked_code`.
 * - `specified_id`: `provisional_create_canister_with_cycles` (development
 *   instances only; mainnet rejects it). It is routed to the canister it asks
 *   for, which is the subnet that will hold it. Without `specified_id` the
 *   spec allows any principal of a subnet the client cannot name, so it is
 *   refused: pass `specified_id`.
 *
 * Left out: the methods the spec says "can only be called by canisters"
 * (`canister_info`, `canister_metadata`, `deposit_cycles`, `raw_rand`, the
 * threshold-signature, `http_request`, bitcoin, `node_metrics_history` and
 * `subnet_info` methods), whose ingress calls the system rejects whatever the
 * routing, and the subnet-admin methods `create_canister` and `list_canisters`,
 * which take "any principal" and so have nothing to route by.
 *
 * Internal: not exported from the package entry.
 *
 * @module
 */

/** The management canister's id. */
export const MANAGEMENT_CANISTER = "aaaaa-aa"

/** Which field of the call's one argument names the effective canister. */
export type EffectiveIdField =
  "canister_id" | "target_canister" | "specified_id"

/**
 * The routing table, method by method, as of the management canister
 * interface (`ic.did`) in dfinity/portal at fe646b2.
 */
export const EFFECTIVE_ID_FIELD: Readonly<Record<string, EffectiveIdField>> =
  Object.freeze({
    canister_metrics: "canister_id",
    canister_status: "canister_id",
    clear_chunk_store: "canister_id",
    delete_canister: "canister_id",
    delete_canister_snapshot: "canister_id",
    fetch_canister_logs: "canister_id",
    install_code: "canister_id",
    list_canister_snapshots: "canister_id",
    load_canister_snapshot: "canister_id",
    provisional_top_up_canister: "canister_id",
    read_canister_snapshot_data: "canister_id",
    read_canister_snapshot_metadata: "canister_id",
    start_canister: "canister_id",
    stop_canister: "canister_id",
    stored_chunks: "canister_id",
    take_canister_snapshot: "canister_id",
    uninstall_code: "canister_id",
    update_settings: "canister_id",
    upload_canister_snapshot_data: "canister_id",
    upload_canister_snapshot_metadata: "canister_id",
    upload_chunk: "canister_id",
    install_chunked_code: "target_canister",
    provisional_create_canister_with_cycles: "specified_id",
  })

/** The effective canister id of a management call, or why there is none. */
export type EffectiveId =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string }

const own = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key)

/**
 * Whether `method` of the management canister has a row in the table. Asked
 * before the arguments are encoded, so a method the client cannot route is
 * refused for what it is, whatever its arguments.
 */
export const isRoutable = (method: string): boolean =>
  own(EFFECTIVE_ID_FIELD, method)

/**
 * The effective canister id of a call to `method` of `aaaaa-aa` with
 * `values`, its arguments as given (already checked against the schema).
 */
export function effectiveCanisterId(
  method: string,
  values: readonly unknown[]
): EffectiveId {
  if (!isRoutable(method)) {
    return {
      ok: false,
      reason:
        `the management canister method ${method} has no effective canister id the client can choose: ` +
        `it is either callable only by canisters, or routed by a principal of a subnet the client cannot name`,
    }
  }
  const field = EFFECTIVE_ID_FIELD[method]
  const [arg] = values
  const value =
    typeof arg === "object" && arg !== null && own(arg, field)
      ? (arg as Record<string, unknown>)[field]
      : undefined
  if (typeof value === "string" && value !== "") return { ok: true, id: value }
  return {
    ok: false,
    reason:
      field === "specified_id"
        ? `${method} without specified_id can be routed to any subnet the client cannot name; pass specified_id`
        : `${method} is routed by the ${field} field of its argument, and the argument has none`,
  }
}
