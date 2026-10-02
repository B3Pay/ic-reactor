import { principal } from "@candid-core/schema"
import { formatUnits, type Client, type ReactorError } from "@ic-reactor/core"
import { ReactorProvider, useAuth, useClient } from "@ic-reactor/react"
import { skipToken, useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState, type FormEvent } from "react"
import type { TransferArg, TransferError } from "./canisters/icrc1.ts"
import { ErrorPanel } from "./ErrorPanel.tsx"
import { shortPrincipal } from "./format.ts"
import {
  DECIMALS,
  FEE,
  MINTING_ACCOUNT,
  SEED_1,
  SEED_2,
  createSandbox,
  type Fault,
  type Sandbox,
} from "./sandbox.ts"
import { readTransferForm, type TransferForm } from "./transfer-form.ts"

const FAULTS: ReadonlyArray<{ value: Fault | "none"; label: string }> = [
  { value: "none", label: "Nothing: the transfer goes through" },
  { value: "reject-4", label: "The canister rejects it (reject code 4)" },
  { value: "lost-reply", label: "The reply is lost on the way back" },
  { value: "http-429", label: "Status 429 once (throttled)" },
  { value: "reject-2", label: "Reject code 2 once (transient)" },
  { value: "http-429-x3", label: "Status 429 three times" },
]

const icp = (units: bigint) => `${formatUnits(units, DECIMALS)} ICP`

/** Who a principal is in this sandbox. */
function nameOf(text: string): string {
  if (text === SEED_1) return "seed 1"
  if (text === SEED_2) return "seed 2"
  if (text === "2vxsx-fae") return "anonymous"
  if (text === MINTING_ACCOUNT.owner) return "minting account"
  return shortPrincipal(text)
}

/**
 * The sandbox each client belongs to, so that the page finds the rest of its
 * sandbox (the auth, the faults, the request log) from the provider's client.
 *
 * Kept by client because the provider keeps one client of the ones its
 * factory made: `StrictMode` calls the factory twice and keeps one result, so
 * a sandbox remembered anywhere else (a ref the factory writes) can be the one
 * React threw away, while the provider runs on the other.
 */
const sandboxes = new WeakMap<Client, Sandbox>()

/**
 * The Sandbox tab: a test client running in this page.
 *
 * Without a `sandbox` prop, the tab makes its sandbox in the provider's
 * factory, so the provider owns the client and disposes it, auth and cache
 * with it, when the tab unmounts. A client made before the factory runs is
 * borrowed and never disposed (see `ReactorProvider`): made there, every
 * unmount, hot reload or render that `StrictMode` drops would leave one alive.
 * A sandbox passed in is borrowed that way on purpose, and stays the caller's
 * to dispose.
 */
export default function SandboxTab(props: {
  /** How long the mocked ledger takes over a read or a transfer. */
  latencyMs?: number
  /**
   * A sandbox to show, for a test that reads its requests; one is made
   * otherwise. The tab never disposes a sandbox it is given.
   */
  sandbox?: Sandbox
}) {
  const { sandbox: given, latencyMs = 400 } = props
  return (
    <ReactorProvider
      client={() => {
        // Only in-memory work, as a provider's factory should do: React may
        // call it twice in development and keep one result.
        const sandbox = given ?? createSandbox({ latencyMs })
        sandboxes.set(sandbox.client, sandbox)
        return sandbox.client
      }}
    >
      <SandboxView />
    </ReactorProvider>
  )
}

function SandboxView() {
  const client = useClient()
  const sandbox = sandboxes.get(client)
  if (sandbox === undefined) {
    throw new Error("SandboxView renders under SandboxTab's provider only.")
  }
  return (
    <>
      <section className="intro">
        <p>
          Everything here runs in this page. <code>createTestClient()</code>{" "}
          from <code>@ic-reactor/core/testing</code> makes a real client: it
          signs each call as whoever is signed in, sends it, and checks the
          certified reply. Only the replica is fake, in memory, running a mocked
          ICRC-1 ledger and ckBTC minter. Arm a fault below to see what the
          client makes of it.
        </p>
      </section>
      <Session sandbox={sandbox} />
      <Accounts sandbox={sandbox} />
      <Transfer sandbox={sandbox} />
      <DepositAddress sandbox={sandbox} />
      <RequestLog sandbox={sandbox} />
    </>
  )
}

function Session({ sandbox }: { sandbox: Sandbox }) {
  const { status, principal: caller, signOut } = useAuth()
  return (
    <section>
      <h2>Who is signed in</h2>
      <p>
        <span className="pill" data-status={status}>
          {status}
        </span>{" "}
        <code>{caller}</code> ({nameOf(caller)})
      </p>
      <div className="row">
        <button
          type="button"
          onClick={() => void sandbox.auth.signIn(1)}
          aria-pressed={status === "signed-in" && caller === SEED_1}
        >
          Sign in as seed 1
        </button>
        <button
          type="button"
          onClick={() => sandbox.auth.switchTo(2)}
          aria-pressed={status === "signed-in" && caller === SEED_2}
        >
          Switch to seed 2
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={status !== "signed-in"}
        >
          Sign out
        </button>
      </div>
      <p className="muted">
        Reads are keyed by the caller, so each switch starts from an empty cache
        for the new principal: one caller's answers are never shown to another.
      </p>
    </section>
  )
}

function Accounts({ sandbox }: { sandbox: Sandbox }) {
  const client = useClient()
  // The options below are built for the caller of this render, and only a
  // component that follows the auth renders again when the caller changes.
  // Without this line the table would keep reading under the last caller's
  // keys after a sign-out or a switch.
  useAuth()
  const { ledger } = sandbox
  const one = useQuery(
    client.queryOptions(ledger, "icrc1_balance_of", {
      owner: SEED_1,
      subaccount: null,
    })
  )
  const two = useQuery(
    client.queryOptions(ledger, "icrc1_balance_of", {
      owner: SEED_2,
      subaccount: null,
    })
  )
  const supply = useQuery(client.queryOptions(ledger, "icrc1_total_supply"))
  const show = (amount: bigint | undefined) =>
    amount === undefined ? "…" : icp(amount)
  return (
    <section>
      <h2>Ledger</h2>
      <dl>
        <div className="kv">
          <dt>seed 1</dt>
          <dd>{show(one.data)}</dd>
        </div>
        <div className="kv">
          <dt>seed 2</dt>
          <dd>{show(two.data)}</dd>
        </div>
        <div className="kv">
          <dt>
            Total supply <span className="muted">(each fee is burned)</span>
          </dt>
          <dd>{show(supply.data)}</dd>
        </div>
        <div className="kv">
          <dt>Fee</dt>
          <dd>{icp(FEE)}</dd>
        </div>
      </dl>
    </section>
  )
}

/** One press of Send: what was sent, and what was known before it went. */
interface Attempt {
  readonly arg: TransferArg
  /**
   * Who sent it: the caller when it was sent, whom the client signed it as.
   * ICRC-1 deduplicates a transfer per sender account, so only this
   * principal can send the same argument again without paying twice.
   */
  readonly from: string
  /** The sender's balance when it was sent, to compare with the re-read. */
  readonly before: bigint | undefined
  /** How many requests the replica had seen before it. */
  readonly firstRequest: number
}

function Transfer({ sandbox }: { sandbox: Sandbox }) {
  const client = useClient()
  const { status, principal: caller } = useAuth()
  const signedIn = status === "signed-in"
  const { ledger } = sandbox

  const mine = useQuery(
    client.queryOptions(
      ledger,
      "icrc1_balance_of",
      signedIn ? { owner: principal(caller), subaccount: null } : skipToken
    )
  )
  // Known as soon as the call fails, while the client's onSettled is still
  // re-reading the ledger: the mutation stays pending until that re-read ends.
  const [failure, setFailure] = useState<ReactorError<TransferError> | null>(
    null
  )
  const transfer = useMutation({
    ...client.mutationOptions(ledger, "icrc1_transfer"),
    onError: (error) => setFailure(error),
  })

  const [form, setForm] = useState<TransferForm>({
    to: SEED_2,
    amount: "1.5",
    fee: "",
  })
  const [fault, setFault] = useState<Fault | "none">("none")
  const [refusal, setRefusal] = useState<{ field: string; reason: string }>()
  const [attempt, setAttempt] = useState<Attempt>()

  const send = (arg: TransferArg, armed: Fault | "none") => {
    setFailure(null)
    setAttempt({
      arg,
      from: caller,
      before: mine.data,
      firstRequest: sandbox.requests.length,
    })
    // A refusal before sending (nobody signed in) would leave the fault
    // armed for whatever comes next, so it is armed only for a real send.
    if (armed !== "none" && signedIn) sandbox.arm(armed)
    transfer.mutate(arg)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const read = readTransferForm(form, DECIMALS)
    if (!read.ok) return setRefusal(read)
    setRefusal(undefined)
    send(read.arg, fault)
    setFault("none")
  }

  const edit = (field: keyof TransferForm) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  return (
    <section>
      <h2>Transfer</h2>
      <form onSubmit={onSubmit}>
        <label htmlFor="to">To (principal)</label>
        <input
          id="to"
          value={form.to}
          onChange={(e) => edit("to")(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={refusal?.field === "to"}
        />
        <div className="row">
          <button type="button" onClick={() => edit("to")(SEED_1)}>
            seed 1
          </button>
          <button type="button" onClick={() => edit("to")(SEED_2)}>
            seed 2
          </button>
          <button
            type="button"
            onClick={() => edit("to")(MINTING_ACCOUNT.owner)}
          >
            minting account (a burn)
          </button>
        </div>
        <div className="pair">
          <div>
            <label htmlFor="amount">Amount (ICP)</label>
            <input
              id="amount"
              value={form.amount}
              onChange={(e) => edit("amount")(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={refusal?.field === "amount"}
            />
          </div>
          <div>
            <label htmlFor="fee">Fee (ICP, optional)</label>
            <input
              id="fee"
              value={form.fee}
              onChange={(e) => edit("fee")(e.target.value)}
              placeholder={formatUnits(FEE, DECIMALS)}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={refusal?.field === "fee"}
            />
          </div>
        </div>
        <label htmlFor="fault">Arm a fault for this transfer</label>
        <select
          id="fault"
          value={fault}
          onChange={(e) => setFault(e.target.value as Fault | "none")}
        >
          {FAULTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="row">
          <button
            type="submit"
            className="primary"
            disabled={transfer.isPending}
          >
            Send as {signedIn ? nameOf(caller) : "anonymous"}
          </button>
        </div>
        {refusal && (
          <p className="error">
            Not sent: {refusal.field} — {refusal.reason}
          </p>
        )}
      </form>
      {attempt && (
        <Outcome
          sandbox={sandbox}
          attempt={attempt}
          transfer={transfer}
          failure={failure}
          caller={caller}
          balance={mine.data}
          onResend={() => send(attempt.arg, "none")}
        />
      )}
    </section>
  )
}

/** What an ICRC-1 `TransferError` means, in a sentence. */
function describeTransferError(err: TransferError): string {
  switch (err.tag) {
    case "BadFee":
      return `Bad fee: the ledger charges ${icp(err.value.expected_fee)}.`
    case "BadBurn":
      return `Bad burn: burn at least ${icp(err.value.min_burn_amount)}.`
    case "InsufficientFunds":
      return `Insufficient funds: the balance is ${icp(err.value.balance)}, less than the amount plus the fee.`
    case "TooOld":
      return "Too old: created_at_time is outside the deduplication window."
    case "CreatedInFuture":
      return "Created in the future: the ledger's clock is behind created_at_time."
    case "TemporarilyUnavailable":
      return "The ledger is temporarily unavailable."
    case "Duplicate":
      return `Duplicate of block ${err.value.duplicate_of}: this exact transfer was made already, and is not made twice.`
    case "GenericError":
      return `Error ${err.value.error_code}: ${err.value.message}`
  }
}

function Outcome(props: {
  sandbox: Sandbox
  attempt: Attempt
  transfer: {
    isPending: boolean
    data?: bigint
    error: ReactorError<TransferError> | null
  }
  failure: ReactorError<TransferError> | null
  /** Who calls now, which may no longer be who sent the attempt. */
  caller: string
  /** The balance of `caller`, as last read. */
  balance: bigint | undefined
  onResend: () => void
}) {
  const { sandbox, attempt, transfer, failure, caller, onResend } = props
  // The balance read is the current caller's: it tells something about the
  // attempt only while that is still its sender. And the same argument
  // signed by anyone else is a new transfer, not one the ledger deduplicates.
  const sameSender = caller === attempt.from
  const after = sameSender ? props.balance : undefined
  const sends = sandbox.requests
    .slice(attempt.firstRequest)
    .filter((r) => r.endpoint === "call" && r.methodName === "icrc1_transfer")
  const refused = sends.filter((r) => r.refused !== undefined).length
  const resent =
    sends.length > 1 ? (
      <p className="note">
        Sent {sends.length} times
        {refused > 0 ? `, ${refused} refused before any canister saw it` : ""}:
        the client re-sends an update by itself only after a failure that proves
        the canister never got it, at most twice.
      </p>
    ) : null

  if (transfer.isPending) {
    return (
      <div className="outcome" data-phase="pending">
        <p>
          {failure === null
            ? "Sending…"
            : failure.mayHaveExecuted
              ? "May have executed: re-reading the balance…"
              : failure.kind === "canister_err"
                ? "The ledger refused it: refreshing the balances…"
                : "Certainly not executed."}
        </p>
        {resent}
      </div>
    )
  }

  const error = transfer.error
  if (error === null) {
    return (
      <div className="outcome" data-phase="ok">
        <p className="ok">
          Sent: block {transfer.data?.toString()}.
          {attempt.before !== undefined && after !== undefined && (
            <>
              {" "}
              Your balance went from {icp(attempt.before)} to {icp(after)}.
            </>
          )}
        </p>
        {resent}
      </div>
    )
  }

  // What the sender pays: the amount, and the fee unless it is a burn.
  const burn = attempt.arg.to.owner === MINTING_ACCOUNT.owner
  const debit = attempt.arg.amount + (attempt.arg.fee ?? (burn ? 0n : FEE))
  let verdict: string | undefined
  if (
    error.mayHaveExecuted &&
    attempt.before !== undefined &&
    after !== undefined
  ) {
    verdict =
      after === attempt.before - debit
        ? `The re-read shows the debit (${icp(attempt.before)} → ${icp(after)}): the transfer happened.`
        : after === attempt.before
          ? `The re-read shows no debit (still ${icp(after)}): it did not happen.`
          : `The balance moved from ${icp(attempt.before)} to ${icp(after)}.`
  }

  return (
    <div className="outcome" data-phase="error">
      <p className={error.mayHaveExecuted ? "warn" : "plain"}>
        {error.mayHaveExecuted
          ? sameSender
            ? "May have executed. The client re-read the ledger:"
            : "May have executed."
          : error.kind === "canister_err"
            ? "Not executed: the ledger ran it and refused."
            : "Certainly not executed."}
      </p>
      {verdict && <p className="verdict">{verdict}</p>}
      <ErrorPanel
        error={error}
        detail={
          error.kind === "canister_err"
            ? describeTransferError(error.err)
            : undefined
        }
      />
      {resent}
      {error.mayHaveExecuted &&
        (sameSender ? (
          <p>
            <button type="button" onClick={onResend}>
              Send the same transfer again
            </button>{" "}
            <span className="muted">
              Same sender, same <code>created_at_time</code>: if the first one
              went through, the ledger answers <code>Duplicate</code> instead of
              paying twice.
            </span>
          </p>
        ) : (
          <p className="note">
            Sent as {nameOf(attempt.from)}, and the caller is now{" "}
            {nameOf(caller)}, so it is not offered again: the ledger
            deduplicates per sender account, and the same transfer sent by
            another caller is a new transfer, out of that caller&apos;s account.
            Go back to {nameOf(attempt.from)} to see the re-read and to send it
            again.
          </p>
        ))}
    </div>
  )
}

/** The call the deposit address is read with, as the page shows it. */
const IDEMPOTENT_READ = `client.queryOptions(minter, "get_btc_address", arg, {
  update: "idempotent",
})`

/**
 * The signed-in caller's ckBTC deposit address. `get_btc_address` is an
 * update, which `client.queryOptions()` refuses unless told it is idempotent:
 * then it is fetched once per caller and kept (no refetch on mount, focus or
 * reconnect, and a ledger transfer does not invalidate the minter's reads).
 */
function DepositAddress({ sandbox }: { sandbox: Sandbox }) {
  const [shown, setShown] = useState(true)
  const count = useRequestCount(sandbox)
  const runs = sandbox.requests
    .slice(0, count)
    .filter(
      (r) =>
        r.endpoint === "call" &&
        r.methodName === "get_btc_address" &&
        r.refused === undefined
    ).length
  return (
    <section>
      <h2>ckBTC deposit address</h2>
      <p className="muted">
        <code>get_btc_address</code> of a mocked ckBTC minter is an update
        method, read as a query because it answers the same however often it
        runs:
      </p>
      <pre>{IDEMPOTENT_READ}</pre>
      {shown && <Address sandbox={sandbox} />}
      <p className="note">
        The minter has run it <strong>{runs}</strong>{" "}
        {runs === 1 ? "time" : "times"}. Hide and show the address, or send a
        transfer, and the count stays: the answer is kept for good, and a ledger
        write does not touch the minter&apos;s reads. A new caller asks once.
        (Under <code>vite dev</code>, React&apos;s StrictMode mounts everything
        twice, and the first read is cancelled and sent again.)
      </p>
      <div className="row">
        <button type="button" onClick={() => setShown(!shown)}>
          {shown ? "Hide" : "Show"} the address
        </button>
      </div>
    </section>
  )
}

function Address({ sandbox }: { sandbox: Sandbox }) {
  const client = useClient()
  const { status, principal: caller } = useAuth()
  const signedIn = status === "signed-in"
  // `owner: null` is the caller's own account; the key holds the caller, so
  // each principal gets an address of its own, cached apart.
  const address = useQuery(
    client.queryOptions(
      sandbox.minter,
      "get_btc_address",
      signedIn ? { owner: null, subaccount: null } : skipToken,
      { update: "idempotent" }
    )
  )
  if (!signedIn) {
    return <p className="muted">Sign in: an update needs a signed caller.</p>
  }
  return (
    <div className="result">
      {address.error ? (
        <ErrorPanel error={address.error} />
      ) : address.data === undefined ? (
        <p className="muted">asking the minter…</p>
      ) : (
        <p>
          <code>{address.data}</code>{" "}
          <span className="muted">
            for {nameOf(caller)}, made up by the sandbox
          </span>
        </p>
      )}
    </div>
  )
}

/** One line of the request log's last column. */
function whatHappened(request: Sandbox["requests"][number]): string {
  if (request.refused !== undefined) {
    // A refusal by status names it; any other is a check that failed.
    const status = /\b[45]\d\d\b/.exec(request.refused)?.[0]
    return `refused (${status ? `status ${status}` : request.refused}): no canister saw it`
  }
  if (request.dropped) return "the reply was lost"
  return request.endpoint === "query" || request.endpoint === "call"
    ? "reached the canister"
    : "answered"
}

/** Re-renders when the replica has seen more requests. */
function useRequestCount(sandbox: Sandbox): number {
  const [count, setCount] = useState(sandbox.requests.length)
  useEffect(() => {
    const timer = setInterval(() => setCount(sandbox.requests.length), 150)
    return () => clearInterval(timer)
  }, [sandbox])
  return count
}

function RequestLog({ sandbox }: { sandbox: Sandbox }) {
  const count = useRequestCount(sandbox)
  const shown = 14
  const first = Math.max(0, count - shown)
  const rows = sandbox.requests.slice(first, count)
  return (
    <section>
      <h2>Requests the replica received</h2>
      <p className="muted">
        <code>createTestClient().requests</code>, newest first. {count} in all.
      </p>
      <table className="log">
        <thead>
          <tr>
            <th>#</th>
            <th>Endpoint</th>
            <th>Method</th>
            <th>Caller</th>
            <th>What happened</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .map((request, i) => (
              <tr key={first + i} data-endpoint={request.endpoint}>
                <td>{first + i + 1}</td>
                <td>{request.endpoint}</td>
                <td>{request.methodName ?? ""}</td>
                <td>{request.caller ? nameOf(request.caller) : ""}</td>
                <td>{whatHappened(request)}</td>
              </tr>
            ))
            .reverse()}
        </tbody>
      </table>
    </section>
  )
}
