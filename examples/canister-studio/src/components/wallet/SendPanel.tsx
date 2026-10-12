import { useAuth, useClient } from "@ic-reactor/react"
import { useMutation } from "@tanstack/react-query"
import { useMemo, useState, type ReactElement } from "react"
import { TransferArg } from "../../canisters/icrc1.ts"
import { ConfirmWrite } from "../../calls/ConfirmWrite.tsx"
import { ErrorPanel } from "../../calls/ErrorPanel.tsx"
import { SIGN_IN_REASON } from "../../calls/kinds.ts"
import { TypedForm } from "../../forms/TypedForm.tsx"
import { heuristicHints } from "../../forms/hints.ts"
import { formatTokens, groupDigits } from "../../lib/format.ts"
import type { RegistryEntry } from "../../lib/registry.ts"
import { Notice } from "../Notice.tsx"
import { Spinner } from "../Spinner.tsx"
import { ledgerCanister, ledgerInterface, transferMethod } from "./ledgers.ts"
import type { LedgerToken } from "./LedgerSummary.tsx"

/** A transfer the user submitted, waiting for the confirm step. */
interface Draft {
  value: TransferArg
  bytes: Uint8Array
}

/**
 * Send tokens: a typed form for `icrc1_transfer` (amounts in the ledger's
 * own decimals, `created_at_time` set to now so the ledger can deduplicate),
 * a confirm step with the exact bytes, then the mutation. No retry, ever.
 *
 * After a failure that may have executed, the only re-send is the one
 * `client.resendOf` offers (same bytes, same sender, same ledger): the
 * ledger answers `Duplicate` if the first one went through. Without that
 * offer, the balance must be read back first.
 */
export function SendPanel({
  entry,
  token,
  onReadBack,
}: {
  entry: RegistryEntry
  token: LedgerToken
  /** Re-reads the caller's balance (after an unknown outcome). */
  onReadBack(): void
}): ReactElement {
  const auth = useAuth()
  const client = useClient()
  const ledger = ledgerCanister(client, entry.id)
  const iface = ledgerInterface(entry)
  const method = transferMethod(iface)
  const transfer = useMutation(client.mutationOptions(ledger, "icrc1_transfer"))
  const [draft, setDraft] = useState<Draft | undefined>(undefined)
  const [formKey, setFormKey] = useState(0)
  // What the form starts from: the last transfer's argument after a failure
  // that certainly did not execute ("edit and try again"), else nothing.
  const [prefill, setPrefill] = useState<TransferArg | undefined>(undefined)
  // Set once a re-send of a may-have-executed transfer was asked for: if
  // that re-send is refused, the first transfer's outcome is still unknown.
  const [resent, setResent] = useState(false)
  const units = useMemo(
    () => ({ decimals: token.decimals, symbol: token.symbol }),
    [token.decimals, token.symbol]
  )
  const hints = useMemo(() => heuristicHints({ units }), [units])

  const signedIn = auth.status === "signed-in"
  // Read during render, in a component that re-renders on caller changes
  // (useAuth): the offer disappears when the sender is no longer the caller.
  const again =
    transfer.error === null
      ? undefined
      : client.resendOf(transfer.error, ledger, "icrc1_transfer", {
          dedupedBy: (arg) => arg.created_at_time,
        })
  const duplicate =
    transfer.error?.kind === "canister_err" &&
    transfer.error.err.tag === "Duplicate"
      ? transfer.error.err.value.duplicate_of
      : undefined

  const startOver = (keepArgument: boolean): void => {
    setPrefill(keepArgument ? draft?.value : undefined)
    setResent(false)
    transfer.reset()
    setDraft(undefined)
    // A new form instance; without a kept argument it has a new
    // created_at_time, so it is a new transfer.
    setFormKey((k) => k + 1)
  }

  if (transfer.isPending) {
    return (
      <div className="row text-sm" role="status">
        <Spinner size="sm" label="Sending" />
        <span>
          Sending through consensus… It executes at most once; do not close the
          tab.
        </span>
      </div>
    )
  }

  if (transfer.isSuccess) {
    return (
      <div className="stack">
        <Notice tone="success" title="Sent">
          <p>
            The ledger recorded the transfer at block{" "}
            <span className="mono">{groupDigits(transfer.data)}</span>. Reads of
            this ledger were invalidated, so your balance reloads by itself.
          </p>
        </Notice>
        <button type="button" className="btn" onClick={() => startOver(false)}>
          New transfer
        </button>
      </div>
    )
  }

  if (transfer.isError) {
    // A refused re-send sent nothing: the first transfer is still unknown.
    const stillUnknown =
      resent && !transfer.error.mayHaveExecuted && duplicate === undefined
    const mayHaveMoved = transfer.error.mayHaveExecuted || stillUnknown
    return (
      <div className="stack">
        {duplicate !== undefined ? (
          <Notice tone="success" title="It had already executed">
            <p>
              The ledger answered <code className="code-inline">Duplicate</code>
              : the first transfer went through, at block{" "}
              <span className="mono">{groupDigits(duplicate)}</span>. Nothing
              was sent twice.
            </p>
          </Notice>
        ) : (
          <ErrorPanel
            error={transfer.error}
            method={method}
            units={units}
            onReadBack={mayHaveMoved ? onReadBack : undefined}
          />
        )}
        {again !== undefined && (
          <Notice tone="warn" title="Re-send safely">
            <p>
              The transfer may have executed. Its{" "}
              <code className="code-inline">created_at_time</code> lets the
              ledger deduplicate it, so it can be sent again: the same bytes, as
              the same sender ({again.from}), to the same ledger. If the first
              one went through, the ledger answers{" "}
              <code className="code-inline">Duplicate</code> and nothing moves
              twice.
            </p>
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setResent(true)
                  transfer.mutate(again.arg)
                }}
              >
                Re-send the same transfer
              </button>
              <button type="button" className="btn" onClick={onReadBack}>
                Read the balance back
              </button>
            </div>
          </Notice>
        )}
        {again === undefined && mayHaveMoved && duplicate === undefined && (
          <Notice
            tone="warn"
            title="Outcome unknown: read the state back first"
          >
            <p>
              {stillUnknown
                ? "The re-send was refused before anything was sent, so the first transfer may still have executed."
                : "No safe re-send is on offer (the sender changed, or the argument has no deduplication key)."}{" "}
              Check your balance before sending anything new.
            </p>
            <button type="button" className="btn" onClick={onReadBack}>
              Read the balance back
            </button>
          </Notice>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => startOver(!mayHaveMoved)}
        >
          {mayHaveMoved
            ? "Start a new, different transfer"
            : "Edit and try again"}
        </button>
      </div>
    )
  }

  if (draft !== undefined) {
    return (
      <ConfirmWrite
        iface={iface}
        method={method}
        values={[draft.value]}
        bytes={draft.bytes}
        caller={auth.principal}
        onConfirm={() => transfer.mutate(draft.value)}
        onCancel={() => {
          setPrefill(draft.value)
          setDraft(undefined)
          setFormKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <div className="stack">
      <TypedForm<TransferArg>
        key={formKey}
        schema={TransferArg}
        label={`Transfer ${token.symbol}`}
        hints={hints}
        initialValue={prefill}
        submitLabel="Review transfer"
        disabledReason={signedIn ? undefined : SIGN_IN_REASON}
        onSubmit={(value, bytes) => setDraft({ value, bytes })}
      />
      <p className="text-xs muted">
        The ledger charges{" "}
        {formatTokens(token.fee, token.decimals, token.symbol)} per transfer
        (leave the fee empty to accept it).
      </p>
    </div>
  )
}
