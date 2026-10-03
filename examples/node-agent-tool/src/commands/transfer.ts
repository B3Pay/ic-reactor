// Scenario 5, writes: `transfer <to> <amount>`.
//
// The rules a write follows (packages/core/llms.txt, Writes and Errors):
//
// 1. Input is checked before anything is sent: the recipient with
//    `principal(text)`, the amount with `parseUnits` at the ledger's own
//    decimals (src/input.ts). The fee is the ledger's own `icrc1_fee`, sent
//    in the argument.
// 2. `created_at_time` is set. An ICRC-1 ledger deduplicates a transfer whose
//    sender and argument (created_at_time included) it has seen within its
//    window, about 24 hours: it answers `Duplicate { duplicate_of }` and moves
//    nothing. That is what makes re-sending the very same argument safe.
// 3. It is sent once, as a direct call. No retry loop: the client re-sends by
//    itself only after a failure that proves the first attempt never got in
//    (HTTP 429, reject code 2), at most twice.
// 4. Every failure is a ReactorError (src/failure.ts maps its kind to an exit
//    code). `mayHaveExecuted: false` is final. `true` means nobody knows: the
//    balance is read back, no new transfer is made, and the tool prints the
//    exact command that re-sends the SAME argument (same sender, same
//    created_at_time), which the ledger runs at most once. With
//    --resend-unknown it makes that one re-send itself. A re-send that does
//    not go through (refused, rejected before it ran, an `Err` other than
//    `Duplicate`) shows only that the re-send moved nothing: the result stays
//    the first attempt's unknown outcome, with its exit code.
// 5. An `Err` from the ledger is a typed `canister_err`, printed plainly.
//    `Duplicate` means the transfer had already gone through: it is done.
import { principal } from "@candid-core/schema"
import { validate } from "@candid-core/schema/validate"
import { formatUnits, isReactorError, type Canister } from "@ic-reactor/core"
import {
  TransferError,
  type Account,
  type Actor,
  type TransferArg,
} from "../canisters/icrc1.ts"
import type { Context } from "../context.ts"
import {
  EXIT_CODES,
  failureOf,
  reportFailure,
  type Failure,
} from "../failure.ts"
import {
  amountArg,
  hexArg,
  nanosArg,
  principalArg,
  subaccountArg,
  toHex,
} from "../input.ts"
import { ledgerOn } from "../ledgers.ts"
import { amount, rows, type Json } from "../output.ts"

/** How long an ICRC-1 ledger remembers a transfer to deduplicate it (TX_WINDOW): 24 hours. */
export const DEDUP_WINDOW_NS = 24n * 60n * 60n * 1_000_000_000n

/** The command line of `transfer`, as typed. */
export interface TransferInput {
  readonly to: string
  readonly amount: string
  readonly toSubaccount?: string | undefined
  readonly fromSubaccount?: string | undefined
  readonly memo?: string | undefined
  readonly fee?: string | undefined
  readonly createdAtTime?: string | undefined
  readonly resendUnknown: boolean
}

/** One transfer, from the moment its argument is built. */
interface Sending {
  readonly ctx: Context
  readonly ledger: Canister<Actor>
  readonly arg: TransferArg
  readonly fee: bigint
  readonly from: Account
  readonly decimals: number
  readonly symbol: string
  /** The sender's balance before the transfer was sent. */
  readonly before: bigint
  readonly resendUnknown: boolean
}

export async function transfer(
  ctx: Context,
  input: TransferInput
): Promise<number> {
  // 1. What needs no ledger, refused before anything is asked.
  const to: Account = {
    owner: principalArg(input.to, "recipient"),
    subaccount:
      input.toSubaccount === undefined
        ? null
        : subaccountArg(input.toSubaccount, "--to-subaccount"),
  }
  const fromSubaccount =
    input.fromSubaccount === undefined
      ? null
      : subaccountArg(input.fromSubaccount, "--from-subaccount")
  const memo = input.memo === undefined ? null : hexArg(input.memo, "--memo")
  const createdAtTime =
    input.createdAtTime === undefined
      ? ctx.now()
      : nanosArg(input.createdAtTime, "--created-at-time")
  const from: Account = {
    owner: principal(ctx.client.caller()),
    subaccount: fromSubaccount,
  }

  // 2. What the amount means on this ledger, and the balance to compare with
  //    afterwards: four reads in parallel.
  const ledger = ledgerOn(ctx.client, ctx.ledger.id)
  const [decimals, symbol, ledgerFee, before] = await Promise.all([
    ledger.icrc1_decimals(),
    ledger.icrc1_symbol(),
    ledger.icrc1_fee(),
    ledger.icrc1_balance_of(from),
  ])
  const fee =
    input.fee === undefined
      ? ledgerFee
      : amountArg(input.fee, decimals, "--fee")
  const arg: TransferArg = {
    to,
    amount: amountArg(input.amount, decimals, "amount"),
    fee,
    memo,
    from_subaccount: fromSubaccount,
    created_at_time: createdAtTime,
  }
  const sending: Sending = {
    ctx,
    ledger,
    arg,
    fee,
    from,
    decimals,
    symbol,
    before,
    resendUnknown: input.resendUnknown,
  }

  // 3. Sent once.
  try {
    return done(sending, await ledger.icrc1_transfer(arg), "sent")
  } catch (error) {
    return await failed(sending, error)
  }
}

const isTransferError = (value: unknown): value is TransferError =>
  validate(TransferError, value).ok

/** The ledger's `Err`, when the failure is one. */
function refusalOf(error: unknown): TransferError | undefined {
  return isReactorError(error) &&
    error.kind === "canister_err" &&
    isTransferError(error.err)
    ? error.err
    : undefined
}

/** What every transfer document carries. */
function fieldsOf(s: Sending): { readonly [field: string]: Json } {
  return {
    network: s.ctx.client.network,
    ledger: { id: s.ctx.ledger.id, name: s.ctx.ledger.name },
    from: s.from,
    to: s.arg.to,
    amount: amount(s.arg.amount, s.decimals),
    fee: amount(s.fee, s.decimals),
    symbol: s.symbol,
    createdAtTime: s.arg.created_at_time,
  }
}

/** Reports a transfer that went through: now, or (a `Duplicate`) earlier. */
function done(
  s: Sending,
  block: bigint,
  outcome: "sent" | "duplicate",
  first?: Failure
): number {
  const tokens = (units: bigint) =>
    `${formatUnits(units, s.decimals)} ${s.symbol}`
  const what =
    outcome === "sent"
      ? first === undefined
        ? `sent in block ${block}`
        : `sent in block ${block} by the re-send: the first attempt had not gone through`
      : first === undefined
        ? `this exact transfer had already gone through, in block ${block}: nothing more moved`
        : `the re-send answered Duplicate: the first attempt had gone through, in block ${block}. Nothing more moved`
  s.ctx.out.result(
    {
      ok: true,
      command: "transfer",
      outcome,
      block,
      resent: first !== undefined,
      ...(first === undefined ? {} : { firstAttempt: attemptOf(first) }),
      ...fieldsOf(s),
    },
    rows([
      [
        "transfer",
        `${tokens(s.arg.amount)} to ${s.arg.to.owner} (fee ${tokens(s.fee)})`,
      ],
      ["outcome", what],
      ["from", s.from.owner],
      ["created_at_time", String(s.arg.created_at_time)],
    ])
  )
  return EXIT_CODES.ok
}

/**
 * Reports a failed send, and after one that may have executed, says what to
 * do. `first` is the first attempt's failure when this one is the re-send.
 */
async function failed(
  s: Sending,
  error: unknown,
  first?: Failure
): Promise<number> {
  const refusal = refusalOf(error)
  if (refusal?.tag === "Duplicate") {
    return done(s, refusal.value.duplicate_of, "duplicate", first)
  }
  const failure = failureOf(error, true)
  // The attempt nobody knows the outcome of: this one, or, when the re-send
  // did not go through, still the first. A re-send that moved nothing tells
  // nothing about the first attempt: a ledger answers some `Err`s (paused, a
  // new fee) before it looks for a duplicate, the other failures never reached
  // it, and the first request may not have run yet.
  const unknown = failure.mayHaveExecuted ? failure : first
  if (unknown === undefined) {
    return reportFailure(
      s.ctx.out,
      "transfer",
      failure,
      { ...fieldsOf(s), ...(refusal ? { err: refusal } : {}) },
      refusal ? [explain(refusal, s)] : []
    )
  }

  // Nobody knows whether it ran. Read the balance back, then re-send the same
  // argument (only if asked to, and only once), or say exactly how to.
  const after = await rereadBalance(s)
  const resend = resendArgv(s)
  const until = isoOfNanos(
    (s.arg.created_at_time ?? s.ctx.now()) + DEDUP_WINDOW_NS
  )
  if (s.resendUnknown && first === undefined) {
    s.ctx.out.note(
      `${failure.kind}: the transfer may have executed. ${balanceLine(s, after)}`
    )
    s.ctx.out.note(
      "--resend-unknown: re-sending the same argument once (same sender, same created_at_time)."
    )
    try {
      return done(s, await s.ledger.icrc1_transfer(s.arg), "sent", failure)
    } catch (second) {
      return await failed(s, second, failure)
    }
  }
  // The exit code, kind and advice are the unknown attempt's, never those of
  // a re-send that did not go through ("safe to run again", "Nothing moved").
  return reportFailure(
    s.ctx.out,
    "transfer",
    unknown,
    {
      ...fieldsOf(s),
      ...(first === undefined
        ? {}
        : {
            firstAttempt: attemptOf(first),
            resendAttempt: attemptOf(failure, refusal),
          }),
      balance: {
        before: amount(s.before, s.decimals),
        after:
          typeof after === "bigint"
            ? amount(after, s.decimals)
            : { kind: after.kind, message: after.message },
      },
      resend,
      dedupUntil: until,
    },
    [
      ...(unknown === failure ? [] : [movedNothing(failure, refusal)]),
      balanceLine(s, after),
      "Do not make a new transfer. Re-send this same one: the ledger runs it at most once, and answers",
      `Duplicate if the first went through (it remembers it until ${until}):`,
      `  node src/cli.ts ${resend.map(shellQuote).join(" ")}`,
      ...(s.resendUnknown
        ? []
        : [
            "(--resend-unknown on a transfer makes this one re-send by itself.)",
          ]),
    ]
  )
}

/** One attempt of a re-sent transfer, as the JSON document lists it. */
function attemptOf(
  failure: Failure,
  err?: TransferError
): { readonly [field: string]: Json | undefined } {
  return {
    kind: failure.kind,
    mayHaveExecuted: failure.mayHaveExecuted,
    message: failure.message,
    ...failure.details,
    ...(err === undefined ? {} : { err }),
  }
}

/**
 * What a re-send that did not go through got, in a sentence: never its own
 * advice, which would hold only if the first attempt had not run.
 */
function movedNothing(
  failure: Failure,
  refusal: TransferError | undefined
): string {
  const got =
    refusal === undefined
      ? `${failure.kind}: ${failure.message}`
      : `the ledger answered ${refusal.tag}, not Duplicate`
  return `The re-send did not go through (${got}). That does not tell whether the first attempt did: it may still have executed.`
}

/** The sender's balance now, or why it could not be read. */
async function rereadBalance(s: Sending): Promise<bigint | Failure> {
  try {
    return await s.ledger.icrc1_balance_of(s.from)
  } catch (error) {
    return failureOf(error)
  }
}

function balanceLine(s: Sending, after: bigint | Failure): string {
  const tokens = (units: bigint) =>
    `${formatUnits(units, s.decimals)} ${s.symbol}`
  if (typeof after !== "bigint") {
    return `The balance could not be read back (${after.kind}); read it with \`balance ${s.from.owner}\`.`
  }
  const read = `Balance read back: ${tokens(after)}, ${tokens(s.before)} before.`
  if (after === s.before) {
    return `${read} Unchanged: it most likely did not go through.`
  }
  if (after === s.before - s.arg.amount - s.fee) {
    return `${read} Less by exactly this amount and fee: it most likely went through.`
  }
  return `${read} Other transfers moved it too: it cannot tell.`
}

/** The command line that sends the very same argument again, as the same caller. */
function resendArgv(s: Sending): string[] {
  const { arg } = s
  const hex = (flag: string, bytes: Uint8Array | null) =>
    bytes === null ? [] : [flag, toHex(bytes)]
  return [
    "transfer",
    arg.to.owner,
    formatUnits(arg.amount, s.decimals),
    "--fee",
    formatUnits(s.fee, s.decimals),
    "--created-at-time",
    String(arg.created_at_time),
    ...hex("--to-subaccount", arg.to.subaccount),
    ...hex("--from-subaccount", arg.from_subaccount),
    ...hex("--memo", arg.memo),
    ...s.ctx.ledger.flags,
    ...s.ctx.network.flags,
    ...s.ctx.caller.flags,
  ]
}

/** The ledger's `Err`, in a sentence. */
function explain(err: TransferError, s: Sending): string {
  const tokens = (units: bigint) =>
    `${formatUnits(units, s.decimals)} ${s.symbol}`
  switch (err.tag) {
    case "BadFee":
      return `BadFee: the ledger's fee is ${tokens(err.value.expected_fee)}, not ${tokens(s.fee)}. Nothing moved; leave out --fee to pay the current fee.`
    case "BadBurn":
      return `BadBurn: a burn (a transfer to the minting account) is at least ${tokens(err.value.min_burn_amount)}. Nothing moved.`
    case "InsufficientFunds":
      return `InsufficientFunds: the account holds ${tokens(err.value.balance)}, and this transfer needs ${tokens(s.arg.amount + s.fee)} (amount and fee). Nothing moved.`
    case "TooOld":
      return "TooOld: created_at_time is older than the ledger's deduplication window, so it can no longer tell whether it ran this transfer. Nothing moved now; read the balance or the ledger's history before sending anything."
    case "CreatedInFuture":
      return `CreatedInFuture: created_at_time is ahead of the ledger's clock (${isoOfNanos(err.value.ledger_time)}). Nothing moved; check this machine's clock.`
    case "TemporarilyUnavailable":
      return "TemporarilyUnavailable: the ledger takes no transfers right now. Nothing moved; try again later."
    case "Duplicate":
      return `Duplicate: this exact transfer already went through, in block ${err.value.duplicate_of}.`
    case "GenericError":
      return `GenericError ${err.value.error_code}: ${err.value.message}. Nothing moved.`
    default: {
      const unhandled: never = err
      throw new Error(`unhandled TransferError ${JSON.stringify(unhandled)}`)
    }
  }
}

/** A time in nanoseconds since the epoch, as ISO 8601 text. */
const isoOfNanos = (nanos: bigint): string =>
  new Date(Number(nanos / 1_000_000n)).toISOString()

/** An argument as a POSIX shell reads it. */
const shellQuote = (text: string): string =>
  /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`
