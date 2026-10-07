// Scenario 7 (with src/app/api/balance/[ledger]/[principal]/route.ts): a Route
// Handler with a client of its own, answering JSON.
//
// Rules:
// - One client per request: the handler builds a client for each request it
//   serves, through `newClient`.
// - A route handler has no cache to fill and no page to hydrate, so it calls
//   the ledger directly (`ledger.icrc1_balance_of(account)`): a direct call
//   never touches a cache.
// - Amounts are base units: the JSON gives the balance as decimal text from
//   `formatUnits` and the exact base units as a string, never as a JSON
//   number, which would lose digits past 2^53.
// - Typed principals are validated with `isPrincipal` and made with
//   `principal()`; anything else is a 400 before any call is made.
// - A failure is a `ReactorError`: its `kind` decides the HTTP status, with
//   `httpStatus` telling a refusal that passes from one that stands
//   (`statusOf`).
import { isPrincipal, principal } from "@candid-core/schema"
import {
  formatUnits,
  isReactorError,
  type Client,
  type ReactorError,
  type ReactorErrorKind,
} from "@ic-reactor/core"
import { actor, type Actor } from "@/canisters/icrc1"
import { LEDGERS } from "@/ledgers"

/** The route's dynamic segments, as Next hands them to the handler. */
export interface BalanceParams {
  /** A ledger's label from src/ledgers.ts (`ICP`, `ckBTC`, `ckETH`, any case) or a canister id. */
  readonly ledger: string
  readonly principal: string
}

/** What the handler answers for each kind of failure; see `statusOf`. */
export const STATUS_BY_KIND = {
  // The request itself is wrong.
  invalid_args: 400,
  unauthenticated: 401,
  // The IC or the canister said no, or answered with something unusable: the
  // upstream failed, not this request, and it gives the same answer again.
  rejected: 502,
  invalid_reply: 502,
  canister_err: 502,
  // Nothing came back in time.
  outcome_unknown: 504,
  // The read was turned away for now (a rate limit, a 5xx, reject code 2) or
  // got no answer: worth asking again later. `statusOf` sends the refusals
  // that stand to 502 instead.
  not_delivered: 503,
  cancelled: 503,
} as const satisfies Record<ReactorErrorKind, number>

/**
 * The HTTP status the handler answers for `error`.
 *
 * `kind` decides it, except where `kind` is not enough: `not_delivered`
 * covers a refusal that passes and one that stands. HTTP 429, 408 and every
 * 5xx pass, and so do reject code 2 and a dropped connection (no
 * `httpStatus`): the client itself re-sends those. Any other 4xx stands: a
 * boundary node answers 400 for a canister id that names no canister
 * (`code: "canister_not_found"`), however often it is asked, and refuses a bad
 * signature the same way each time. Telling a caller to come back later (503)
 * for that would be a lie, so it is a 502, like a rejection.
 */
export function statusOf(error: ReactorError<unknown>): number {
  const { kind, httpStatus } = error
  const refusedForGood =
    kind === "not_delivered" &&
    httpStatus !== undefined &&
    httpStatus >= 400 &&
    httpStatus < 500 &&
    httpStatus !== 408 &&
    httpStatus !== 429
  return refusedForGood ? 502 : STATUS_BY_KIND[kind]
}

const json = (status: number, body: unknown): Response =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  })

/** The canister id `text` names: a ledger's label, or a canister id itself. */
function ledgerIdOf(text: string): string | undefined {
  const known = LEDGERS.find(
    ({ label }) => label.toLowerCase() === text.toLowerCase()
  )
  if (known !== undefined) return known.id
  return isPrincipal(text) ? text : undefined
}

/**
 * The `GET` handler of the balance route. `newClient` builds the client for
 * one request; the route passes `() => createClient({ network: "ic",
 * identity: "anonymous" })`, and the tests a test client.
 */
export function balanceRoute(newClient: () => Client) {
  return async (
    _request: Request,
    context: { params: Promise<BalanceParams> }
  ): Promise<Response> => {
    const params = await context.params
    const ledgerId = ledgerIdOf(params.ledger)
    if (ledgerId === undefined) {
      return json(400, {
        error: {
          kind: "invalid_args",
          message: `${params.ledger} is neither ${LEDGERS.map(({ label }) => label).join(", ")} nor a canister id.`,
        },
      })
    }
    if (!isPrincipal(params.principal)) {
      return json(400, {
        error: {
          kind: "invalid_args",
          message: `${params.principal} is not principal text.`,
        },
      })
    }
    const owner = principal(params.principal)

    const client = newClient()
    const ledger = client.canister<Actor>(actor, { id: ledgerId })
    try {
      const [baseUnits, decimals, symbol] = await Promise.all([
        ledger.icrc1_balance_of({ owner, subaccount: null }),
        ledger.icrc1_decimals(),
        ledger.icrc1_symbol(),
      ])
      return json(200, {
        ledger: ledgerId,
        owner,
        symbol,
        decimals,
        balance: formatUnits(baseUnits, decimals),
        baseUnits: baseUnits.toString(),
      })
    } catch (error) {
      if (!isReactorError(error)) throw error
      return json(statusOf(error), {
        error: {
          kind: error.kind,
          ...(error.code !== undefined && { code: error.code }),
          ...(error.rejectCode !== undefined && {
            rejectCode: error.rejectCode,
          }),
          ...(error.httpStatus !== undefined && {
            httpStatus: error.httpStatus,
          }),
          message: error.message,
        },
      })
    }
  }
}
