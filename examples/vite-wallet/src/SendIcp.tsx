// Scenario 5: send ICP with
// `useMutation(client.mutationOptions(ledger, "icrc1_transfer"))`.
//
// - What is typed becomes an argument in transfer.ts, or is refused there:
//   nothing half-valid is sent.
// - The ledger's `Err` is a `canister_err` with a typed `err`
//   (InsufficientFunds, BadFee, Duplicate, ...), worded by
//   `describeTransferError`. Nothing was executed.
// - `mayHaveExecuted` (a lost reply, a reject after the canister ran): the
//   page says the outcome is unknown. It does not re-read anything itself:
//   the client's onSettled already refetched the ledger's reads, the balance
//   included. It offers "Send the same transfer again" only while the sender
//   is still the caller. The same argument (same `created_at_time`) from the
//   same account is deduplicated (`Duplicate` if the first one went through);
//   from another account it would be a new transfer, paid in full.
// - No `retry` is added: the client re-sends an update only when the failure
//   proves it never arrived, and any other re-send could pay twice.
import type { ReactorError } from "@ic-reactor/core"
import { useAuth, useClient } from "@ic-reactor/react"
import { useMutation } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import type { TransferArg, TransferError } from "./canisters/ledger.ts"
import { ErrorNote } from "./ErrorNote.tsx"
import { showAmount, useToken, type Token } from "./token.ts"
import {
  describeTransferError,
  readTransferForm,
  type TransferForm,
} from "./transfer.ts"
import { useCanisters } from "./use-canisters.ts"

/** One press of Send: what was sent, and who signed it. */
interface Attempt {
  readonly arg: TransferArg
  /** The principal the client signed it as, read from the client when sent. */
  readonly from: string
}

export function SendIcp() {
  const client = useClient()
  const { ledger } = useCanisters()
  const { status, principal: caller } = useAuth()
  const token = useToken()
  const transfer = useMutation(client.mutationOptions(ledger, "icrc1_transfer"))
  const [form, setForm] = useState<TransferForm>({ to: "", amount: "" })
  const [refusal, setRefusal] = useState<{ field: string; reason: string }>()
  const [attempt, setAttempt] = useState<Attempt>()
  const signedIn = status === "signed-in"

  const send = (arg: TransferArg) => {
    // The client signs with whoever is signed in when the mutation runs:
    // `client.caller()` now, which a switch this render has not caught up
    // with can make differ from `caller`. Send nothing then.
    const from = client.caller()
    if (from !== caller) return
    setAttempt({ arg, from })
    transfer.mutate(arg)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (token === undefined) return
    const read = readTransferForm(form, token)
    if (!read.ok) return setRefusal(read)
    setRefusal(undefined)
    send(read.arg)
  }

  return (
    <section aria-labelledby="send">
      <p className="scenario">Scenario 5</p>
      <h2 id="send">Send ICP</h2>
      <form onSubmit={onSubmit}>
        <label htmlFor="send-to">To (principal)</label>
        <input
          id="send-to"
          value={form.to}
          onChange={(e) => setForm({ ...form, to: e.target.value })}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={refusal?.field === "to"}
        />
        <label htmlFor="send-amount">
          Amount{token ? ` (${token.symbol})` : ""}
        </label>
        <input
          id="send-amount"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={refusal?.field === "amount"}
        />
        {token && (
          <p className="muted">
            Fee {showAmount(token.fee, token)}, paid on top of the amount.
          </p>
        )}
        <div className="row">
          <button
            type="submit"
            className="primary"
            disabled={!signedIn || token === undefined || transfer.isPending}
          >
            Send
          </button>
          {!signedIn && <span className="muted">Sign in to send.</span>}
        </div>
        {refusal && (
          <p className="error" role="alert">
            Not sent: {refusal.field}: {refusal.reason}
          </p>
        )}
      </form>
      {attempt && token && (
        <Outcome
          attempt={attempt}
          caller={caller}
          token={token}
          isPending={transfer.isPending}
          block={transfer.data}
          error={transfer.error}
          onSendAgain={() => send(attempt.arg)}
        />
      )}
    </section>
  )
}

/** What became of the last transfer. */
export function Outcome(props: {
  attempt: Attempt
  /** Who calls now: maybe no longer who sent the attempt. */
  caller: string
  token: Token
  isPending: boolean
  block: bigint | undefined
  error: ReactorError<TransferError> | null
  onSendAgain: () => void
}) {
  const { attempt, caller, token, error } = props
  if (props.isPending) {
    return (
      <p className="muted" data-testid="outcome">
        Sending {showAmount(attempt.arg.amount, token)}…
      </p>
    )
  }
  if (error === null) {
    return (
      <p className="ok" data-testid="outcome">
        Sent {showAmount(attempt.arg.amount, token)}: block{" "}
        {props.block?.toString()}.
      </p>
    )
  }
  return (
    <div data-testid="outcome">
      <ErrorNote
        error={error}
        refusal={
          error.kind === "canister_err"
            ? describeTransferError(error.err, token)
            : undefined
        }
      />
      {/* Only to the account that sent it: the ledger deduplicates per
          sender, and the same argument from another account would be a
          new transfer, paid in full. */}
      {error.mayHaveExecuted && caller === attempt.from && (
        <p>
          <button type="button" onClick={props.onSendAgain}>
            Send the same transfer again
          </button>{" "}
          <span className="muted">
            Same account, same <code>created_at_time</code>: if the first one
            went through, the ledger answers Duplicate instead of paying twice.
          </span>
        </p>
      )}
    </div>
  )
}
