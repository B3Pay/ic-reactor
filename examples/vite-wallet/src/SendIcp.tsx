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
//   included. "Send the same transfer again" is `client.resendOf`'s offer:
//   made only after such a failure, only while the account that sent it is
//   still the caller, and only because the argument has a `created_at_time`
//   (`dedupedBy`), which is what the ledger deduplicates on. Pressed, it sends
//   the attempt's own argument, the same `memo` and `created_at_time`, through
//   the same mutation, as that account, to the same ledger and unchanged, or
//   not at all: the ledger answers `Duplicate` if the first one went through.
//   From another account, or to another ledger, it would be a new transfer,
//   paid in full. Each press of Send reads the form again into a new
//   argument, so a new transfer gets a new memo, and is never taken for the
//   duplicate of another one of the same amount made in the same millisecond.
// - No `retry` is added: the client re-sends an update only when the failure
//   proves it never arrived, and any other re-send could pay twice.
import type { ReactorError } from "@ic-reactor/core"
import { useAuth, useClient } from "@ic-reactor/react"
import { useMutation } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import type { TransferArg, Icrc1TransferError } from "./canisters/ledger.ts"
import { ErrorNote } from "./ErrorNote.tsx"
import { showAmount, useToken, type Token } from "./token.ts"
import {
  describeTransferError,
  readTransferForm,
  type TransferForm,
} from "./transfer.ts"
import { useCanisters } from "./use-canisters.ts"

/** What the ledger deduplicates a transfer on: absent, a re-send could pay twice. */
export const dedupedBy = (arg: TransferArg) => arg.created_at_time

/** What became of the last transfer sent from a form. */
interface Kept {
  variables: TransferArg
  isPending: boolean
  data?: bigint
  error: ReactorError<Icrc1TransferError> | null
}

/**
 * `useMutation(client.mutationOptions(ledger, "icrc1_transfer"))`, with the
 * outcome of the last transfer kept in the form's own state as well. The
 * options `useClient()` builds are the caller's, and their key with them, so
 * after an account switch the mutation is a new, idle one, while an unknown
 * outcome must stay on screen: `client.resendOf` withdraws its offer while
 * another account is the caller, and makes it again once the sender is back.
 * The callbacks of the options a run was pressed with are the ones it calls,
 * so they still reach this state after the switch.
 */
export function useTransfer() {
  const client = useClient()
  const { ledger } = useCanisters()
  const [kept, setKept] = useState<Kept>()
  const options = client.mutationOptions(ledger, "icrc1_transfer")
  const transfer = useMutation({
    ...options,
    onSuccess: (data, variables) =>
      setKept({ variables, isPending: true, data, error: null }),
    onError: (error, variables) =>
      setKept({ variables, isPending: true, error }),
    // The client's own onSettled re-reads the ledger, the balance included;
    // the transfer reads as pending until that ends.
    onSettled: async (...args: Parameters<typeof options.onSettled>) => {
      try {
        await options.onSettled(...args)
      } finally {
        setKept((last) => last && { ...last, isPending: false })
      }
    },
  })
  const shown: Kept | undefined =
    transfer.variables !== undefined
      ? {
          variables: transfer.variables,
          isPending: transfer.isPending,
          data: transfer.data,
          error: transfer.error,
        }
      : kept
  // Read on every render: `useAuth()` re-renders this on a switch of account,
  // and the offer follows the caller.
  const again = client.resendOf(
    shown?.error ?? null,
    ledger,
    "icrc1_transfer",
    { dedupedBy }
  )
  const mutate = (arg: TransferArg) => {
    setKept({ variables: arg, isPending: true, error: null })
    transfer.mutate(arg)
  }
  return { shown, again, mutate }
}

export function SendIcp() {
  const client = useClient()
  const { status, principal: caller } = useAuth()
  const token = useToken()
  const transfer = useTransfer()
  const { again } = transfer
  const [form, setForm] = useState<TransferForm>({ to: "", amount: "" })
  const [refusal, setRefusal] = useState<{ field: string; reason: string }>()
  const signedIn = status === "signed-in"

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (token === undefined) return
    const read = readTransferForm(form, token)
    if (!read.ok) return setRefusal(read)
    setRefusal(undefined)
    // The client signs with whoever is signed in when the mutation runs:
    // `client.caller()` now, which a switch this render has not caught up
    // with can make differ from `caller`. Send nothing then.
    if (client.caller() !== caller) return
    transfer.mutate(read.arg)
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
            disabled={
              !signedIn || token === undefined || transfer.shown?.isPending
            }
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
      {transfer.shown && token && (
        <Outcome
          arg={transfer.shown.variables}
          token={token}
          isPending={transfer.shown.isPending}
          block={transfer.shown.data}
          error={transfer.shown.error}
          onSendAgain={again && (() => transfer.mutate(again.arg))}
        />
      )}
    </section>
  )
}

/** What became of the last transfer. */
export function Outcome(props: {
  /** The argument the last transfer sent. */
  arg: TransferArg
  token: Token
  isPending: boolean
  block: bigint | undefined
  error: ReactorError<Icrc1TransferError> | null
  /** Sends the same transfer again: present only while `client.resendOf` offers it. */
  onSendAgain: (() => void) | undefined
}) {
  const { arg, token, error } = props
  if (props.isPending) {
    return (
      <p className="muted" data-testid="outcome">
        Sending {showAmount(arg.amount, token)}…
      </p>
    )
  }
  if (error === null) {
    return (
      <p className="ok" data-testid="outcome">
        Sent {showAmount(arg.amount, token)}: block {props.block?.toString()}.
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
      {/* Offered by client.resendOf: only after an unknown outcome, and only
          to the account that sent it, since the ledger deduplicates per
          sender and the same argument from another account would be a new
          transfer, paid in full. */}
      {props.onSendAgain && (
        <p>
          <button type="button" onClick={props.onSendAgain}>
            Send the same transfer again
          </button>{" "}
          <span className="muted">
            Same account, same <code>memo</code> and{" "}
            <code>created_at_time</code>: if the first one went through, the
            ledger answers Duplicate instead of paying twice.
          </span>
        </p>
      )}
    </div>
  )
}
