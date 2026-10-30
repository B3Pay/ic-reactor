import { useAuth, useClient } from "@ic-reactor/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react"
import { principal } from "@meantjs/schema"
import { TransferArg, type Account } from "../../canisters/icrc1.ts"
import { ConfirmWrite, type EarlierSend } from "../../calls/ConfirmWrite.tsx"
import { resendLeftOpen } from "../../calls/dedupe.ts"
import { ErrorPanel } from "../../calls/ErrorPanel.tsx"
import { addHistoryEntry, newHistoryId } from "../../calls/history.ts"
import { SIGN_IN_REASON } from "../../calls/kinds.ts"
import { historyEntryOf, type CallResult } from "../../calls/record.ts"
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
  /** The sender the confirm step showed when it opened. */
  reviewedAs?: string
}

/** A clause as a sentence: its first letter upper-cased. */
const sentence = (clause: string): string =>
  clause.charAt(0).toUpperCase() + clause.slice(1)

/**
 * Send tokens: a typed form for `icrc1_transfer` (amounts in the ledger's
 * own decimals, `created_at_time` set to now so the ledger can deduplicate),
 * a confirm step with the exact bytes, then the mutation. No retry, ever.
 *
 * After a failure that may have executed, the only re-send is the one
 * `client.resendOf` offers (same bytes, same sender, same ledger): the
 * ledger answers `Duplicate` if the first one went through. Without that
 * offer, the balance must be read back first.
 *
 * Every transfer and re-send is recorded in the history when it settles,
 * even after the panel is gone (another ledger's tab, another page): an
 * unknown outcome outlives the panel's state.
 */
export function SendPanel({
  entry,
  token,
}: {
  entry: RegistryEntry
  token: LedgerToken
}): ReactElement {
  const auth = useAuth()
  const client = useClient()
  const ledger = ledgerCanister(client, entry.id)
  const iface = ledgerInterface(entry)
  const method = transferMethod(iface)
  const transfer = useMutation(client.mutationOptions(ledger, "icrc1_transfer"))
  // The last transfer this panel sent, kept in its own state as well: the
  // options `useClient()` builds are the caller's, and their key with them,
  // so after an account switch `transfer` is a new, idle mutation, while an
  // unknown outcome must stay on screen (read back as its sender) until the
  // user moves on.
  const [inFlight, setInFlight] = useState(false)
  const [settled, setSettled] = useState<
    | { readonly ok: true; readonly data: bigint }
    | { readonly ok: false; readonly error: NonNullable<typeof transfer.error> }
    | undefined
  >(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const live = transfer.status !== "idle"
  const error = live
    ? transfer.error
    : settled?.ok === false
      ? settled.error
      : null
  const isPending = live ? transfer.isPending : inFlight
  const data = live
    ? transfer.data
    : settled?.ok === true
      ? settled.data
      : undefined
  const [draft, setDraft] = useState<Draft | undefined>(undefined)
  // The transfer that went out, and as whom: what a re-send repeats, byte
  // for byte.
  const [sent, setSent] = useState<(Draft & EarlierSend) | undefined>(undefined)
  // The transfers set aside while their outcome was unknown ("Start a new,
  // different transfer"): every later confirm step names them, since
  // nothing ties a new transfer to them.
  const [setAside, setSetAside] = useState<readonly EarlierSend[]>([])
  const [formKey, setFormKey] = useState(0)
  // What the form starts from: the last transfer's argument after a failure
  // that certainly did not execute ("edit and try again"), else nothing.
  const [prefill, setPrefill] = useState<TransferArg | undefined>(undefined)
  // Set once a re-send of a may-have-executed transfer was asked for: if
  // that re-send is refused, the first transfer's outcome is still unknown.
  const [resent, setResent] = useState(false)
  // Set when Send found another sender than the confirm step had shown.
  const [senderChanged, setSenderChanged] = useState(false)
  // The account a read-back reads: the one the unknown transfer spent from,
  // its sender's, never the current caller's (who may have switched since).
  const [readBackOf, setReadBackOf] = useState<Account | undefined>(undefined)
  const onReadBack = (): void => {
    if (sent === undefined) return
    const account: Account = {
      owner: principal(sent.caller),
      subaccount: sent.value.from_subaccount,
    }
    setReadBackOf(account)
    void client.queryClient.invalidateQueries({
      queryKey: client.queryKey(ledger, "icrc1_balance_of", account),
    })
  }
  const units = useMemo(
    () => ({ decimals: token.decimals, symbol: token.symbol }),
    [token.decimals, token.symbol]
  )
  const hints = useMemo(() => heuristicHints({ units }), [units])
  // The confirm step and the outcome replace the form, taking the focus
  // with them: once the form is back, the focus returns to its button.
  const submitRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (!refocus.current || submitRef.current === null) return
    refocus.current = false
    submitRef.current.focus()
  })

  const signedIn = auth.status === "signed-in"
  // Read during render, in a component that re-renders on caller changes
  // (useAuth): the offer disappears when the sender is no longer the caller.
  const again =
    error === null
      ? undefined
      : client.resendOf(error, ledger, "icrc1_transfer", {
          dedupedBy: (arg) => arg.created_at_time,
        })
  const duplicate =
    error?.kind === "canister_err" && error.err.tag === "Duplicate"
      ? error.err.value.duplicate_of
      : undefined

  // `mutateAsync`, not `mutate`'s callbacks: those never run once the panel
  // unmounts, and the history must still get the outcome.
  const send = (
    value: TransferArg,
    bytes: Uint8Array,
    caller: string,
    resend: boolean
  ): void => {
    const record = (result: CallResult) =>
      addHistoryEntry(
        historyEntryOf(
          {
            iface,
            method,
            caller,
            bytes,
            result,
            note: resend ? "re-send:" : undefined,
          },
          Date.now(),
          newHistoryId()
        )
      )
    setInFlight(true)
    setSettled(undefined)
    void transfer.mutateAsync(value).then(
      (reply) => {
        record({ ok: true, reply })
        if (!mounted.current) return
        setInFlight(false)
        setSettled({ ok: true, data: reply })
      },
      (failure: NonNullable<typeof transfer.error>) => {
        record({ ok: false, error: failure })
        if (!mounted.current) return
        setInFlight(false)
        setSettled({ ok: false, error: failure })
      }
    )
  }

  const startOver = (keepArgument: boolean, unknown: boolean): void => {
    if (unknown && sent !== undefined) {
      const { bytes, caller } = sent
      setSetAside((list) => [...list, { bytes, caller }])
    }
    setPrefill(keepArgument ? draft?.value : undefined)
    setResent(false)
    setReadBackOf(undefined)
    transfer.reset()
    setInFlight(false)
    setSettled(undefined)
    setDraft(undefined)
    setSent(undefined)
    // A new form instance; without a kept argument it has a new
    // created_at_time, so it is a new transfer.
    setFormKey((k) => k + 1)
    refocus.current = true
  }

  if (isPending) {
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

  if (data !== undefined) {
    return (
      <div className="stack">
        <Notice tone="success" title="Sent">
          <p>
            The ledger recorded the transfer at block{" "}
            <span className="mono">{groupDigits(data)}</span>. Reads of this
            ledger were invalidated, so your balance reloads by itself.
          </p>
        </Notice>
        <button
          type="button"
          className="btn"
          onClick={() => startOver(false, false)}
        >
          New transfer
        </button>
      </div>
    )
  }

  if (error !== null) {
    // A re-send refused, or answered other than Duplicate (TooOld, BadFee),
    // says nothing about the first transfer: that one is still unknown.
    const stillUnknown =
      resent && !error.mayHaveExecuted && duplicate === undefined
    const mayHaveMoved = error.mayHaveExecuted || stillUnknown
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
            error={error}
            method={method}
            units={units}
            earlierUnknown={stillUnknown}
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
                  if (sent === undefined) return
                  setResent(true)
                  send(again.arg, sent.bytes, again.from, true)
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
                ? `${sentence(resendLeftOpen(error))}. The first transfer may still have executed.`
                : "No safe re-send is on offer (the sender changed, or the argument has no deduplication key)."}{" "}
              Check your balance before sending anything new. The transfer is in
              your history, with its exact bytes.
            </p>
            <button type="button" className="btn" onClick={onReadBack}>
              Read the balance back
            </button>
          </Notice>
        )}
        {readBackOf !== undefined && (
          <SenderBalance
            entry={entry}
            account={readBackOf}
            units={units}
            caller={auth.principal}
          />
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => startOver(!mayHaveMoved, mayHaveMoved)}
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
      <div className="stack">
        {senderChanged && (
          <Notice tone="warn" title="The sender changed">
            <p>
              The signed-in principal changed while this step was open. Check
              the sender below, then send again: nothing was sent.
            </p>
          </Notice>
        )}
        <ConfirmWrite
          iface={iface}
          method={method}
          values={[draft.value]}
          bytes={draft.bytes}
          caller={auth.principal}
          earlierUnknown={setAside}
          onConfirm={() => {
            const caller = client.caller()
            if (caller !== (draft.reviewedAs ?? caller)) {
              // The step was confirmed for another sender: show it again with
              // the one the transfer would go out as, and send nothing.
              setDraft({ ...draft, reviewedAs: caller })
              setSenderChanged(true)
              return
            }
            setSenderChanged(false)
            setSent({ ...draft, caller })
            send(draft.value, draft.bytes, caller, false)
          }}
          onCancel={() => {
            setSenderChanged(false)
            setPrefill(draft.value)
            setDraft(undefined)
            setFormKey((k) => k + 1)
            refocus.current = true
          }}
        />
      </div>
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
        submitRef={submitRef}
        onSubmit={(value, bytes) =>
          setDraft({ value, bytes, reviewedAs: client.caller() })
        }
      />
      <p className="text-xs muted">
        The ledger charges{" "}
        {formatTokens(token.fee, token.decimals, token.symbol)} per transfer
        (leave the fee empty to accept it).
      </p>
    </div>
  )
}

/**
 * The balance of the account an unknown transfer spent from: its sender's
 * (and subaccount), read whoever is signed in now, since a balance is
 * public. Reading the current caller's instead would check the wrong
 * account after a switch.
 */
function SenderBalance({
  entry,
  account,
  units,
  caller,
}: {
  entry: RegistryEntry
  account: Account
  units: { decimals: number; symbol: string }
  caller: string
}): ReactElement {
  const client = useClient()
  const ledger = ledgerCanister(client, entry.id)
  const balance = useQuery(
    client.queryOptions(ledger, "icrc1_balance_of", account)
  )
  const whose =
    account.owner === caller
      ? "your account"
      : `${account.owner}, the transfer's sender (not the current caller)`
  return (
    <div className="kv" role="status" aria-label="Sender balance">
      <span className="text-sm muted">
        Balance of {whose}
        {account.subaccount === null ? "" : ", from its subaccount"}
      </span>
      <span className="tabular">
        {balance.data !== undefined ? (
          formatTokens(balance.data, units.decimals, units.symbol)
        ) : balance.isError ? (
          balance.error.message
        ) : (
          <Spinner size="sm" label="Reading the balance" />
        )}
      </span>
    </div>
  )
}
