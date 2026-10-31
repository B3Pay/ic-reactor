import { principal, type Principal } from "@candid-core/schema"
import { isReactorError } from "@ic-reactor/core"
import { MutationObserver, type QueryKey } from "@tanstack/react-query"
import {
  actor as icrc1Actor,
  type Actor as Icrc1Actor,
  type TransferArg,
  type TransferError,
} from "../canisters/icrc1.ts"
import { nowNanos } from "../forms/convert.ts"
import type { DynActor } from "../lib/reactor.ts"
import {
  callUntyped,
  clip,
  describeFailure,
  failureOf,
  fieldsOf,
  issuePaths,
  logged,
  present,
  runInLab,
  sent,
  settle,
  show,
  valueOf,
  type LoggedRequest,
  type Recorder,
  type Scenario,
  type ScenarioReply,
} from "./lab-run.ts"
import {
  createLab,
  LAB_FEE,
  LAB_INDEX_ID,
  LAB_LEDGER_ID,
  labIndexActor,
  type Lab,
  type LabIndexActor,
} from "./mock-ledger.ts"

export type {
  LabeledError,
  LoggedRequest,
  Scenario,
  ScenarioReply,
  ScenarioResult,
  ScenarioStep,
  ScenarioVerdict,
} from "./lab-run.ts"

// The ten scenarios of the Safety lab. Each runs against a fresh
// createTestClient() (mock-ledger.ts) and states, as checks, what ic-reactor
// must do; lab-run.ts turns any check that does not hold into a failed
// verdict.

/** The setup every scenario starts from (shown once, above the cards). */
export const LAB_SETUP = `import { createTestClient } from "@ic-reactor/core/testing"
import { MutationObserver } from "@tanstack/react-query"
import { actor, type Actor, type TransferArg } from "./canisters/icrc1"

// LEDGER: the ckBTC ledger's id, "mxzaz-hqaaa-aaaar-qaada-cai" (mocked here).
// seed1, seed2: the principals of the test identities of seeds 1 and 2.
const { client, auth, mock, reject, dropNextReply, refuseNext, requests } =
  createTestClient({ network: "ic" }) // signed in as the identity of seed 1
// Balances (seed 1 holds 1 ckBTC), fee 10, created_at_time deduplication:
mock<Actor>(actor, LEDGER, ledgerHandlers)
const ledger = client.canister<Actor>(actor, { id: LEDGER })
// What useMutation runs, without React:
const transfer = new MutationObserver(
  client.queryClient,
  client.mutationOptions(ledger, "icrc1_transfer"),
)
const arg = { to: { owner: seed2, subaccount: null }, amount: 25_000n,
  fee: null, memo: null, from_subaccount: null,
  created_at_time: BigInt(Date.now()) * 1_000_000n }
const dedupe = { dedupedBy: (a: TransferArg) => a.created_at_time }`

/** What the identity of seed 1 holds when a scenario starts: 1 ckBTC. */
export const START_BALANCE = 100_000_000n

/** Who the transfers pay: the identity of seed 2. */
const SEED2 = principal(
  "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"
)
const ANONYMOUS = "2vxsx-fae"

/** The typed Err payload of a transfer's `canister_err`. */
function transferErr(lab: Lab, error: unknown): TransferError | undefined {
  return isReactorError(error, lab.ledger, "icrc1_transfer") &&
    error.kind === "canister_err"
    ? error.err
    : undefined
}

const transferArg = (overrides: Partial<TransferArg> = {}): TransferArg => ({
  to: { owner: SEED2, subaccount: null },
  amount: 25_000n,
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time: nowNanos(),
  ...overrides,
})

const accountOf = (owner: Principal) => ({ owner, subaccount: null })

/** The caller as a checked principal (the test auth's text is always principal text). */
const callerOf = (lab: Lab): Principal => principal(lab.client.caller())

/** What `useMutation(client.mutationOptions(ledger, "icrc1_transfer"))` runs, without React. */
function transferObserver(lab: Lab) {
  return new MutationObserver(
    lab.client.queryClient,
    lab.client.mutationOptions(lab.ledger, "icrc1_transfer")
  )
}

const dedupedBy = { dedupedBy: (arg: TransferArg) => arg.created_at_time }

/** The caller's balance, read back as a direct query. */
async function readBack(
  lab: Lab,
  r: Recorder,
  expected: bigint
): Promise<ScenarioReply | undefined> {
  const balance = valueOf(
    r,
    "Read the balance back (icrc1_balance_of)",
    await settle(() => lab.ledger.icrc1_balance_of(accountOf(callerOf(lab))))
  )
  if (balance === undefined) return undefined
  r.same("The balance is what one execution leaves", balance, expected)
  return { method: "icrc1_balance_of", value: balance, tokens: true }
}

// ---------------------------------------------------------------------------
// The scenarios
// ---------------------------------------------------------------------------

const anonymousWrite: Scenario = {
  id: "anonymous-write",
  title: "An anonymous write is refused before it is sent",
  rule: "A write is sent as whoever is signed in when it runs. If nobody is, the client refuses it (unauthenticated) before calling anything.",
  narrative:
    "Nobody is signed in, and the page runs a transfer through the same mutation options useMutation takes. The client looks up the caller when the mutation runs, finds the anonymous principal and refuses: nothing is signed, nothing reaches the replica, and the error says for certain that nothing ran.",
  expected:
    "unauthenticated / anonymous_write, mayHaveExecuted false, 0 requests.",
  code: `createTestClient({ network: "ic", signedIn: false })
client.caller() // "2vxsx-fae"

await transfer.mutate(arg)
// ReactorError: kind "unauthenticated", code "anonymous_write",
// mayHaveExecuted false
requests.length // 0`,
  run: () =>
    runInLab({ signedIn: false }, async (lab, r) => {
      r.same("Nobody is signed in", lab.client.caller(), ANONYMOUS)
      const error = failureOf(
        r,
        "transfer.mutate(arg) is refused",
        await settle(() => transferObserver(lab).mutate(transferArg()))
      )
      r.same("kind", fieldsOf(error)?.kind, "unauthenticated")
      r.same("code", fieldsOf(error)?.code, "anonymous_write")
      r.same("mayHaveExecuted", fieldsOf(error)?.mayHaveExecuted, false)
      r.same("Requests the replica received", lab.kit.requests.length, 0)
      r.same("Transfers the ledger ran", lab.mock.executed, 0)
      return { error }
    }),
}

/** A transfer argument that does not encode: a principal that is not one, a negative nat. */
const BAD_TRANSFER: Readonly<Record<string, unknown>> = {
  to: { owner: "alice", subaccount: null },
  amount: -5n,
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time: null,
}

const invalidArgs: Scenario = {
  id: "invalid-args",
  title: "Arguments that do not encode never leave the page",
  rule: "Arguments that do not encode make the call reject invalid_args, with the codec's issues; a render never throws on half-typed input.",
  narrative:
    "A transfer whose owner is not principal text and whose amount is a negative nat is sent through an untyped view of the ledger, which is what a form over a runtime interface holds. The codec refuses it before anything is signed. Its issue names the field, rooted at $args[0] (the codec stops at the first field that fails, so fixing the owner moves the issue to the amount), and the form below puts each issue on its field with the same paths. A read with the same mistake gets a $invalid key instead of throwing during render.",
  expected:
    "invalid_args at $args[0].to.owner, then at $args[0].amount once the owner is fixed; 0 requests.",
  code: `const untyped = client.canister<DynActor>(actor, { id: LEDGER })
await untyped.icrc1_transfer({
  to: { owner: "alice", subaccount: null }, // not principal text
  amount: -5n,                              // a nat is never negative
  fee: null, memo: null, from_subaccount: null, created_at_time: null,
})
// ReactorError: kind "invalid_args", issues: [{ path: "$args[0].to.owner", … }]
// with the owner fixed, the issue moves to "$args[0].amount"

client.queryKey(untyped, "icrc1_balance_of", { owner: "alice", subaccount: null })
// [..., "$invalid", …]: the read rejects invalid_args when it runs`,
  run: () =>
    runInLab({ fund: START_BALANCE }, async (lab, r) => {
      // The same canister object, typed for values that are not checked yet.
      const untyped = lab.client.canister<DynActor>(icrc1Actor, {
        id: LAB_LEDGER_ID,
      })
      r.same(
        "The untyped view is the same canister object",
        Object.is(untyped, lab.ledger),
        true
      )
      const error = failureOf(
        r,
        "icrc1_transfer(bad argument) is refused",
        await settle(() => callUntyped(untyped, "icrc1_transfer", BAD_TRANSFER))
      )
      r.same("kind", fieldsOf(error)?.kind, "invalid_args")
      r.same("mayHaveExecuted", fieldsOf(error)?.mayHaveExecuted, false)
      const paths = issuePaths(error)
      r.check(
        "Its issues are rooted at $args[0]",
        paths.length > 0 && paths.every((p) => p.startsWith("$args[0]")),
        show(paths)
      )
      r.check(
        "The issue is on $args[0].to.owner, the first field that fails",
        paths.includes("$args[0].to.owner"),
        show(paths)
      )

      // The codec stops at the first field that fails: fix it and the next
      // one is named.
      const ownerFixed = {
        ...BAD_TRANSFER,
        to: { owner: SEED2, subaccount: null },
      }
      const next = failureOf(
        r,
        "With the owner fixed, it is refused again",
        await settle(() => callUntyped(untyped, "icrc1_transfer", ownerFixed))
      )
      r.check(
        "Now the issue is on $args[0].amount",
        issuePaths(next).includes("$args[0].amount"),
        show(issuePaths(next))
      )

      const badAccount = { owner: "alice", subaccount: null }
      const key = await settle(() =>
        lab.client.queryKey(untyped, "icrc1_balance_of", badAccount)
      )
      r.check(
        "A read of the same mistake builds a $invalid key without throwing",
        key.ok && key.value.includes("$invalid"),
        key.ok ? show(key.value.slice(4)) : describeFailure(key.error)
      )
      const read = await settle(() =>
        lab.client.queryClient.fetchQuery(
          lab.client.queryOptions(untyped, "icrc1_balance_of", badAccount)
        )
      )
      const readError = failureOf(r, "Running that read is refused", read)
      r.same("The read's kind", fieldsOf(readError)?.kind, "invalid_args")
      r.same("Requests the replica received", lab.kit.requests.length, 0)
      return {
        error,
        form: { method: "icrc1_transfer", values: [BAD_TRANSFER] },
      }
    }),
}

const lostReply: Scenario = {
  id: "lost-reply",
  title: "A lost reply: re-send safely, and it runs once",
  rule: "Send the same write again after mayHaveExecuted: true only to a method that deduplicates, such as an ICRC-1 transfer with created_at_time set, and only through resendOf.",
  narrative:
    "The ledger runs the transfer, but its reply is lost on the way back. The client cannot know whether it ran, so it says outcome_unknown and mayHaveExecuted: true, and retries nothing. Because the argument carries created_at_time, resendOf offers to send the very same bytes again, as the same sender. The ledger recognises the transaction and answers Duplicate: it executed exactly once, and the balance read back agrees.",
  expected:
    "outcome_unknown (mayHaveExecuted true), resendOf offered, send() → canister_err Duplicate, 1 execution.",
  code: `dropNextReply()
await transfer.mutate(arg)
// ReactorError: kind "outcome_unknown", mayHaveExecuted true

const error = transfer.getCurrentResult().error
const again = client.resendOf(error, ledger, "icrc1_transfer", dedupe)
again.arg === arg // the very object that was sent
await again.send()
// ReactorError: kind "canister_err", err { tag: "Duplicate", … }`,
  run: () =>
    runInLab({ fund: START_BALANCE }, async (lab, r) => {
      const arg = transferArg()
      const observer = transferObserver(lab)
      lab.kit.dropNextReply()
      r.note("dropNextReply(): the ledger will run, its reply will be lost")
      const error = failureOf(
        r,
        "transfer.mutate(arg) fails",
        await settle(() => observer.mutate(arg))
      )
      r.check(
        "The mutation keeps that error",
        observer.getCurrentResult().error === error
      )
      r.same("kind", fieldsOf(error)?.kind, "outcome_unknown")
      r.same("mayHaveExecuted", fieldsOf(error)?.mayHaveExecuted, true)
      r.same("The ledger did run it", lab.mock.executed, 1)
      r.same(
        "The client sent it once (no blind retry)",
        sent(lab, "icrc1_transfer").length,
        1
      )

      const again = lab.client.resendOf(
        error,
        lab.ledger,
        "icrc1_transfer",
        dedupedBy
      )
      if (!present(r, "resendOf offers a re-send", again)) {
        return { error }
      }
      r.check("It offers the very object that was sent", again.arg === arg)
      r.same(
        "It re-sends as the original sender",
        again.from,
        lab.client.caller()
      )

      const duplicate = failureOf(
        r,
        "again.send() is answered with an Err",
        await settle(() => again.send())
      )
      r.same("kind", fieldsOf(duplicate)?.kind, "canister_err")
      const err = transferErr(lab, duplicate)
      r.same("The Err is Duplicate", err?.tag, "Duplicate")
      if (err?.tag === "Duplicate") {
        r.same("duplicate_of the first block", err.value.duplicate_of, 0n)
      }
      r.same("The ledger ran it exactly once", lab.mock.executed, 1)
      r.same(
        "The re-send reached the replica",
        sent(lab, "icrc1_transfer").length,
        2
      )
      const reply = await readBack(lab, r, START_BALANCE - arg.amount - LAB_FEE)
      return {
        error,
        moreErrors: [{ label: "The re-send: Duplicate", error: duplicate }],
        ...(reply === undefined ? {} : { reply }),
      }
    }),
}

const throttled: Scenario = {
  id: "http-429",
  title: "HTTP 429: the client re-sends once, by itself",
  rule: "The client itself re-sends an update, at most twice, only after a failure proving the canister never got it (reject code 2, status 429); any other failure is final.",
  narrative:
    "The boundary node throttles the first transfer with HTTP 429 before any canister sees it. That status proves the update never got in, so the client waits briefly and sends the same request again on its own: the mutation still has retry: false, and the caller sees one success. The log shows two calls, the first refused.",
  expected:
    "Ok (block index) after 2 icrc1_transfer calls, the first refused 429.",
  code: `refuseNext(429, { method: "icrc1_transfer" })
await transfer.mutate({ ...arg, created_at_time: null }) // 0n: the block index
requests.filter((q) => q.methodName === "icrc1_transfer")
// [{ refused: "refuseNext(429) answered …" }, { caller: "psith-…" }]`,
  run: () =>
    runInLab({ fund: START_BALANCE }, async (lab, r) => {
      lab.kit.refuseNext(429, { method: "icrc1_transfer" })
      r.note('refuseNext(429, { method: "icrc1_transfer" })')
      const options = lab.client.mutationOptions(lab.ledger, "icrc1_transfer")
      r.same("The mutation options never retry", options.retry, false)
      const block = valueOf(
        r,
        "transfer.mutate(arg) succeeds",
        await settle(() =>
          new MutationObserver(lab.client.queryClient, options).mutate(
            transferArg({ created_at_time: null })
          )
        )
      )
      const calls = sent(lab, "icrc1_transfer")
      r.same("icrc1_transfer calls the replica received", calls.length, 2)
      r.check(
        "The first was refused with 429",
        calls[0]?.refused?.includes("429") === true,
        calls[0]?.refused
      )
      r.same("The second went through", calls[1]?.refused, undefined)
      r.same("The ledger ran it once", lab.mock.executed, 1)
      return block === undefined
        ? {}
        : { reply: { method: "icrc1_transfer", value: block, tokens: false } }
    }),
}

const trapped: Scenario = {
  id: "reject-5",
  title: "A trap (reject 5) may have executed: no blind retry",
  rule: "Read mayHaveExecuted on every failed write. A method with no deduplication key has no safe re-send: read the state back.",
  narrative:
    "The ledger traps while handling the transfer. A canister can commit work before it traps (an inter-canister call made earlier commits its side), so ic-reactor cannot promise nothing happened: kind rejected, reject code 5, mayHaveExecuted true. It sends nothing again by itself, and since this argument has no created_at_time, resendOf offers nothing either: the right move is to read the state back. Here the trap rolled the transfer back, so the balance is unchanged.",
  expected:
    "rejected, rejectCode 5, mayHaveExecuted true, 1 call, resendOf undefined.",
  code: `mock<Actor>(actor, LEDGER, {
  ...ledgerHandlers,
  icrc1_transfer: () => { throw new Error("assertion failed: …") }, // a trap
})
await transfer.mutate({ ...arg, created_at_time: null })
// ReactorError: kind "rejected", rejectCode 5, mayHaveExecuted true

client.resendOf(error, ledger, "icrc1_transfer", dedupe)
// undefined: nothing to deduplicate on, so read the state back:
await ledger.icrc1_balance_of({ owner: seed1, subaccount: null })`,
  run: () =>
    runInLab({ fund: START_BALANCE }, async (lab, r) => {
      lab.mock.failNextTransfer({
        kind: "trap",
        message: "assertion failed: the memo is longer than 32 bytes",
      })
      r.note("The ledger's next transfer traps")
      const error = failureOf(
        r,
        "transfer.mutate(arg) fails",
        await settle(() =>
          transferObserver(lab).mutate(transferArg({ created_at_time: null }))
        )
      )
      r.same("kind", fieldsOf(error)?.kind, "rejected")
      r.same("rejectCode", fieldsOf(error)?.rejectCode, 5)
      r.same("mayHaveExecuted", fieldsOf(error)?.mayHaveExecuted, true)
      r.same(
        "It was sent once (no blind retry)",
        sent(lab, "icrc1_transfer").length,
        1
      )
      r.same(
        "resendOf offers nothing without a created_at_time",
        lab.client.resendOf(error, lab.ledger, "icrc1_transfer", dedupedBy),
        undefined
      )
      const reply = await readBack(lab, r, START_BALANCE)
      return { error, ...(reply === undefined ? {} : { reply }) }
    }),
}

const destinationInvalid: Scenario = {
  id: "reject-3",
  title: "Reject 3: certainly not executed",
  rule: "A reject 1 or 3 proves nothing ran: mayHaveExecuted is false, nothing is invalidated, and no re-send is offered.",
  narrative:
    "The replica rejects the transfer with code 3 (destination invalid), the reject a call gets when the canister cannot take it at all. That proves the canister never ran it, so mayHaveExecuted is false. Even though the argument carries created_at_time, resendOf offers nothing: there is no unknown outcome to resolve, and a fresh attempt is simply a new write.",
  expected:
    "rejected, rejectCode 3, mayHaveExecuted false, resendOf undefined, balance unchanged.",
  code: `mock<Actor>(actor, LEDGER, {
  ...ledgerHandlers,
  icrc1_transfer: () => reject(3, "Requested canister has no wasm module"),
})
await transfer.mutate(arg) // arg has created_at_time
// ReactorError: kind "rejected", rejectCode 3, mayHaveExecuted false
client.resendOf(error, ledger, "icrc1_transfer", dedupe)
// undefined: the outcome is known, nothing to resolve`,
  run: () =>
    runInLab({ fund: START_BALANCE }, async (lab, r) => {
      lab.mock.failNextTransfer({
        kind: "reject",
        code: 3,
        message: "Requested canister has no wasm module",
      })
      r.note("The ledger's next transfer is rejected with code 3")
      const error = failureOf(
        r,
        "transfer.mutate(arg) fails",
        await settle(() => transferObserver(lab).mutate(transferArg()))
      )
      r.same("kind", fieldsOf(error)?.kind, "rejected")
      r.same("rejectCode", fieldsOf(error)?.rejectCode, 3)
      r.same("mayHaveExecuted", fieldsOf(error)?.mayHaveExecuted, false)
      r.same(
        "resendOf offers nothing: the outcome is known",
        lab.client.resendOf(error, lab.ledger, "icrc1_transfer", dedupedBy),
        undefined
      )
      r.same("It was sent once", sent(lab, "icrc1_transfer").length, 1)
      r.same("Transfers the ledger ran", lab.mock.executed, 0)
      const reply = await readBack(lab, r, START_BALANCE)
      return { error, ...(reply === undefined ? {} : { reply }) }
    }),
}

const canisterErr: Scenario = {
  id: "canister-err",
  title: "An Err result is a typed canister_err",
  rule: "A method whose result is variant { Ok; Err } resolves with the Ok value; Err rejects as kind canister_err, with the Err value in err.",
  narrative:
    'The transfer asks for more than the account holds. The ledger answers Err InsufficientFunds, a reply, not a failure of the call: ic-reactor rejects with kind canister_err, mayHaveExecuted false, and the Err payload in err. Narrowed with isReactorError(error, ledger, "icrc1_transfer"), err is typed as the ledger\'s TransferError, so the balance in it is a bigint with no cast.',
  expected:
    'canister_err, mayHaveExecuted false, err { tag: "InsufficientFunds", value: { balance } }.',
  code: `try {
  await ledger.icrc1_transfer({ ...arg, amount: 2_000_000_000n })
} catch (error) {
  if (isReactorError(error, ledger, "icrc1_transfer") &&
      error.kind === "canister_err" &&
      error.err.tag === "InsufficientFunds") {
    error.err.value.balance // bigint, typed from the .did
  }
}`,
  run: () =>
    runInLab({ fund: START_BALANCE }, async (lab, r) => {
      const error = failureOf(
        r,
        "icrc1_transfer(20 ckBTC) fails",
        await settle(() =>
          lab.ledger.icrc1_transfer(transferArg({ amount: 2_000_000_000n }))
        )
      )
      if (isReactorError(error, lab.ledger, "icrc1_transfer")) {
        r.same("kind", error.kind, "canister_err")
        r.same("mayHaveExecuted", error.mayHaveExecuted, false)
        const err = error.kind === "canister_err" ? error.err : undefined
        r.same("The Err is InsufficientFunds", err?.tag, "InsufficientFunds")
        if (err?.tag === "InsufficientFunds") {
          r.same(
            "Its balance is the account's",
            err.value.balance,
            START_BALANCE
          )
        }
      } else {
        r.check(
          'isReactorError(error, ledger, "icrc1_transfer") narrows it',
          false,
          describeFailure(error)
        )
      }
      r.same("Transfers the ledger ran", lab.mock.executed, 0)
      return { error }
    }),
}

const callerChanged: Scenario = {
  id: "caller-changed",
  title: "The caller changes: reads and re-sends refuse",
  rule: "A read is made as the caller current when its options are built, and a re-send goes out only as its sender; for anyone else nothing is sent (caller_changed). The read is cancelled; the re-send stays outcome_unknown, since the write it re-sends may have run.",
  narrative:
    "Options for a balance read are built while seed 1 is signed in, then the user switches to seed 2 before the read runs: the query function refuses to send seed 1's read as seed 2. Then a transfer by seed 1 loses its reply. After a switch to seed 2, resendOf offers nothing, and the offer already in hand refuses to go out as the wrong sender. Back as seed 1, the offer returns and the re-send answers Duplicate.",
  expected:
    "cancelled / caller_changed for the read, outcome_unknown / caller_changed for send() as seed 2, 0 extra requests; offer restored for seed 1.",
  code: `const account = { owner: seed2, subaccount: null }
const read = client.queryOptions(ledger, "icrc1_balance_of", account) // as seed 1
auth.switchTo(2)
await client.queryClient.fetchQuery(read)
// ReactorError: kind "cancelled", code "caller_changed"

auth.switchTo(1); dropNextReply(); await transfer.mutate(arg) // outcome_unknown
const again = client.resendOf(error, ledger, "icrc1_transfer", dedupe)
auth.switchTo(2)
client.resendOf(error, ledger, "icrc1_transfer", dedupe) // undefined
await again.send() // outcome_unknown / caller_changed, nothing sent
auth.switchTo(1)
await again.send() // canister_err Duplicate: it ran once`,
  run: () =>
    runInLab({ fund: START_BALANCE }, async (lab, r) => {
      const { auth } = lab.kit
      const seed1 = lab.client.caller()
      const read = lab.client.queryOptions(
        lab.ledger,
        "icrc1_balance_of",
        accountOf(SEED2)
      )
      r.same("The read's key holds seed 1", read.queryKey[2], seed1)
      auth.switchTo(2)
      r.note("auth.switchTo(2) before the read runs", lab.client.caller())
      const before = lab.kit.requests.length
      const readError = failureOf(
        r,
        "Running seed 1's read as seed 2 is refused",
        await settle(() => lab.client.queryClient.fetchQuery(read))
      )
      r.same("kind", fieldsOf(readError)?.kind, "cancelled")
      r.same("code", fieldsOf(readError)?.code, "caller_changed")
      r.same("Nothing was sent", lab.kit.requests.length, before)

      auth.switchTo(1)
      r.note("auth.switchTo(1); dropNextReply(); transfer.mutate(arg)")
      const arg = transferArg()
      lab.kit.dropNextReply()
      const lost = failureOf(
        r,
        "The transfer's reply is lost",
        await settle(() => transferObserver(lab).mutate(arg))
      )
      const again = lab.client.resendOf(
        lost,
        lab.ledger,
        "icrc1_transfer",
        dedupedBy
      )
      if (!present(r, "resendOf offers a re-send to seed 1", again)) {
        return { error: readError }
      }
      auth.switchTo(2)
      r.note("auth.switchTo(2)")
      r.same(
        "resendOf offers nothing to seed 2",
        lab.client.resendOf(lost, lab.ledger, "icrc1_transfer", dedupedBy),
        undefined
      )
      const calls = sent(lab, "icrc1_transfer").length
      const refused = failureOf(
        r,
        "again.send() as seed 2 is refused",
        await settle(() => again.send())
      )
      // The write it re-sends may have run: its outcome stays unknown.
      r.same("kind", fieldsOf(refused)?.kind, "outcome_unknown")
      r.same("mayHaveExecuted", fieldsOf(refused)?.mayHaveExecuted, true)
      r.same("code", fieldsOf(refused)?.code, "caller_changed")
      r.same("Nothing was sent", sent(lab, "icrc1_transfer").length, calls)

      auth.switchTo(1)
      r.note("auth.switchTo(1)")
      r.check(
        "The offer is back for its sender",
        lab.client.resendOf(lost, lab.ledger, "icrc1_transfer", dedupedBy) !==
          undefined
      )
      const duplicate = failureOf(
        r,
        "again.send() as seed 1 is answered",
        await settle(() => again.send())
      )
      r.same(
        "The answer is Duplicate",
        transferErr(lab, duplicate)?.tag,
        "Duplicate"
      )
      r.same("The ledger ran it exactly once", lab.mock.executed, 1)
      return {
        error: readError,
        moreErrors: [
          { label: "The re-send as seed 2", error: refused, afterResend: true },
        ],
      }
    }),
}

/** The key segments after the caller's: what two callers' keys of one read share. */
const afterCaller = (key: QueryKey): string => JSON.stringify(key.slice(3))

const cacheIsolation: Scenario = {
  id: "cache-isolation",
  title: "One read, two principals, two keys",
  rule: "Keys are [\"ic-reactor\", network, caller, canisterId, method, args]: one principal's cached answer is never served to another; after a sign-in, sign-out or switch, the new caller's key is empty until it loads.",
  narrative:
    "The same balance read, with the same argument, is made by seed 1 and then by seed 2. Their keys differ only in the caller segment, so each principal gets its own cache entry, and seed 2 starts with nothing, whatever the cache holds for seed 1. After a sign-out the anonymous key is empty too: nothing cached for a principal is shown to anyone else.",
  expected:
    "Two keys that differ only at the caller; seed 2's and the anonymous key start empty.",
  code: `const account = { owner: seed2, subaccount: null }
await client.queryClient.fetchQuery(
  client.queryOptions(ledger, "icrc1_balance_of", account)) // as seed 1
auth.switchTo(2)
client.queryClient.getQueryData(
  client.queryKey(ledger, "icrc1_balance_of", account)) // undefined
await client.queryClient.fetchQuery(
  client.queryOptions(ledger, "icrc1_balance_of", account)) // as seed 2
await auth.signOut()
client.queryClient.getQueryData(
  client.queryKey(ledger, "icrc1_balance_of", account)) // undefined`,
  run: () =>
    runInLab({ fund: START_BALANCE }, async (lab, r) => {
      const { auth } = lab.kit
      const { queryClient } = lab.client
      lab.mock.fund(SEED2, 5_000n)
      const account = accountOf(SEED2)
      const keyNow = (): QueryKey =>
        lab.client.queryKey(lab.ledger, "icrc1_balance_of", account)

      const first = lab.client.queryOptions(
        lab.ledger,
        "icrc1_balance_of",
        account
      )
      const value1 = valueOf(
        r,
        "Seed 1 reads the balance",
        await settle(() => queryClient.fetchQuery(first))
      )
      const key1 = first.queryKey
      r.same("Its key holds seed 1", key1[2], lab.client.caller())

      auth.switchTo(2)
      r.note("auth.switchTo(2)", lab.client.caller())
      r.same(
        "Seed 2's key starts empty",
        queryClient.getQueryData(keyNow()),
        undefined
      )
      const second = lab.client.queryOptions(
        lab.ledger,
        "icrc1_balance_of",
        account
      )
      const value2 = valueOf(
        r,
        "Seed 2 reads the same balance",
        await settle(() => queryClient.fetchQuery(second))
      )
      const key2 = second.queryKey
      r.same("Same answer for both", value2, value1)
      r.check(
        "The keys differ",
        JSON.stringify(key1) !== JSON.stringify(key2),
        `${show(key1[2])} vs ${show(key2[2])}`
      )
      r.check(
        "Only in the caller segment",
        JSON.stringify(key1.slice(0, 2)) === JSON.stringify(key2.slice(0, 2)) &&
          afterCaller(key1) === afterCaller(key2)
      )

      await auth.signOut()
      r.note("auth.signOut()", lab.client.caller())
      r.same(
        "The anonymous key is empty",
        queryClient.getQueryData(keyNow()),
        undefined
      )
      r.same(
        "Reads cached for the anonymous principal",
        queryClient.getQueryCache().findAll({
          queryKey: lab.client.queryKey(lab.ledger),
        }).length,
        0
      )
      return value1 === undefined
        ? {}
        : { reply: { method: "icrc1_balance_of", value: value1, tokens: true } }
    }),
}

const certifiedTwin: Scenario = {
  id: "certified-twin",
  title: "The certified twin: its own keys, no composite queries",
  rule: 'The target { id, certified: true } certifies query replies; it is a separate canister object with keys ending in "certified", and a composite query on it is refused.',
  narrative:
    'The certified twin of the ledger is a different canister object. Its balance read goes out as a replicated call whose certificate the client verifies, and it caches under a key that ends in "certified", so a certified answer and an uncertified one never mix. A composite query cannot be certified: building its read options on the certified twin of the index throws a TypeError at once, while the plain index answers it.',
  expected:
    'Separate keys ("certified" last), query vs call in the log, TypeError for the certified composite query.',
  code: `const account = { owner: seed1, subaccount: null }
const certified = client.canister<Actor>(actor, { id: LEDGER, certified: true })
client.queryKey(certified, "icrc1_balance_of", account).at(-1) // "certified"
await client.queryClient.fetchQuery(
  client.queryOptions(certified, "icrc1_balance_of", account)) // a replicated call

// An index canister whose balance_via_ledger is a composite query:
const index = client.canister<Index>(indexActor, { id: INDEX, certified: true })
client.queryOptions(index, "balance_via_ledger", account)
// TypeError: a composite query cannot be certified`,
  run: () =>
    runInLab({ fund: START_BALANCE }, async (lab, r) => {
      const { queryClient } = lab.client
      const account = accountOf(callerOf(lab))
      const certified = lab.client.canister<Icrc1Actor>(icrc1Actor, {
        id: LAB_LEDGER_ID,
        certified: true,
      })
      r.check(
        "The certified twin is another canister object",
        certified !== lab.ledger
      )
      const plainKey = lab.client.queryKey(
        lab.ledger,
        "icrc1_balance_of",
        account
      )
      const certifiedKey = lab.client.queryKey(
        certified,
        "icrc1_balance_of",
        account
      )
      r.same(
        'The certified key ends in "certified"',
        certifiedKey.at(-1),
        "certified"
      )
      r.check(
        "The plain key ends in the argument bytes",
        plainKey.at(-1) !== "certified",
        clip(String(plainKey.at(-1)))
      )
      r.check(
        "The keys differ",
        JSON.stringify(plainKey) !== JSON.stringify(certifiedKey)
      )

      const plain = valueOf(
        r,
        "The plain read",
        await settle(() =>
          queryClient.fetchQuery(
            lab.client.queryOptions(lab.ledger, "icrc1_balance_of", account)
          )
        )
      )
      const cert = valueOf(
        r,
        "The certified read",
        await settle(() =>
          queryClient.fetchQuery(
            lab.client.queryOptions(certified, "icrc1_balance_of", account)
          )
        )
      )
      r.same("Both read the same balance", cert, plain)
      const balanceRequests = sent(lab, "icrc1_balance_of").map(
        (q) => q.endpoint
      )
      r.same(
        "The plain read went out as a query, the certified one as a call",
        balanceRequests.join(" then "),
        "query then call"
      )
      const cache = queryClient.getQueryCache()
      const plainEntry = cache.find({ queryKey: plainKey, exact: true })
      const certifiedEntry = cache.find({ queryKey: certifiedKey, exact: true })
      r.check(
        "Each twin has its own cache entry",
        plainEntry !== undefined &&
          certifiedEntry !== undefined &&
          plainEntry !== certifiedEntry
      )
      // Keys are prefixes of each other: the canister's prefix matches the
      // certified key too, which is how a write invalidates both twins.
      r.same(
        "The canister's key prefix matches both, so a write invalidates both",
        cache.findAll({ queryKey: lab.client.queryKey(lab.ledger) }).length,
        2
      )

      const certifiedIndex = lab.client.canister<LabIndexActor>(labIndexActor, {
        id: LAB_INDEX_ID,
        certified: true,
      })
      const refused = await settle(() =>
        lab.client.queryOptions(certifiedIndex, "balance_via_ledger", account)
      )
      r.check(
        "A composite query on the certified twin throws a TypeError",
        !refused.ok && refused.error instanceof TypeError,
        refused.ok ? "it built options" : describeFailure(refused.error)
      )
      valueOf(
        r,
        "The plain index answers the composite query",
        await settle(() =>
          queryClient.fetchQuery(
            lab.client.queryOptions(lab.index, "balance_via_ledger", account)
          )
        )
      )
      return plain === undefined
        ? {}
        : { reply: { method: "icrc1_balance_of", value: plain, tokens: true } }
    }),
}

export const SCENARIOS: readonly Scenario[] = [
  anonymousWrite,
  invalidArgs,
  lostReply,
  throttled,
  trapped,
  destinationInvalid,
  canisterErr,
  callerChanged,
  cacheIsolation,
  certifiedTwin,
]

/** What a transfer sent from the lab's form did. */
export type LabSend =
  | {
      readonly ok: true
      readonly block: bigint
      readonly requests: readonly LoggedRequest[]
    }
  | {
      readonly ok: false
      readonly error: unknown
      readonly requests: readonly LoggedRequest[]
    }

/**
 * Sends `vars` (the form's corrected transfer) as seed 1 to a fresh lab, so
 * the invalid-arguments card can show the fixed call going through. Never
 * rejects: a failure, the lab's own included, is the outcome.
 */
export async function sendTransferInLab(vars: unknown): Promise<LabSend> {
  let lab: Lab | undefined
  try {
    lab = await createLab({ fund: START_BALANCE })
    const untyped = lab.client.canister<DynActor>(icrc1Actor, {
      id: LAB_LEDGER_ID,
    })
    const block = await callUntyped(untyped, "icrc1_transfer", vars)
    const requests = lab.kit.requests.map(logged)
    return typeof block === "bigint"
      ? { ok: true, block, requests }
      : {
          ok: false,
          error: new TypeError("the reply is not a block index"),
          requests,
        }
  } catch (error) {
    return {
      ok: false,
      error,
      requests: lab === undefined ? [] : lab.kit.requests.map(logged),
    }
  } finally {
    lab?.client.dispose()
  }
}
