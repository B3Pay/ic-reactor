import { parseUnits } from "@ic-reactor/core"
import { useAuth, useClient } from "@ic-reactor/react"
import { skipToken, useQuery } from "@tanstack/react-query"
import { useId, useState, type ReactElement } from "react"
import { CacheKeyPanel } from "../../calls/CacheKeyPanel.tsx"
import { formatTokens } from "../../lib/format.ts"
import { Card } from "../Card.tsx"
import { CopyButton } from "../CopyButton.tsx"
import { Notice } from "../Notice.tsx"
import { Skeleton, Spinner } from "../Spinner.tsx"
import { CKBTC_MINTER, minterCanister } from "./ledgers.ts"

// Bitcoin amounts on the minter are satoshis.
const BTC_DECIMALS = 8
const NAT64_MAX = 2n ** 64n - 1n

const btc = (sats: bigint): string => formatTokens(sats, BTC_DECIMALS, "BTC")

/**
 * The ckBTC minter, typed: the caller's bitcoin deposit address through the
 * idempotent-update opt-in, and two public reads (the minter's limits and a
 * withdrawal fee estimate).
 */
export function MinterPanel(): ReactElement {
  return (
    <Card
      title="ckBTC minter"
      subtitle={`Bitcoin in and out of ckBTC (${CKBTC_MINTER.id})`}
      headingLevel={2}
      id="wallet-minter"
    >
      <div className="grid wallet-minter-grid">
        <DepositAddress />
        <MinterLimits />
        <WithdrawalFee />
      </div>
    </Card>
  )
}

function DepositAddress(): ReactElement {
  const auth = useAuth()
  const client = useClient()
  const [asked, setAsked] = useState(false)
  const minter = minterCanister(client)
  const signedIn = auth.status === "signed-in"
  // `owner: null` is the caller. An update, read through the explicit
  // idempotent opt-in: the same caller always gets the same address, so the
  // answer is cached (stale time Infinity) and never read again by itself.
  const arg = { owner: null, subaccount: null }
  const address = useQuery(
    client.queryOptions(
      minter,
      "get_btc_address",
      asked && signedIn ? arg : skipToken,
      { update: "idempotent" }
    )
  )

  return (
    <section className="stack-sm" aria-labelledby="deposit-title">
      <h3 id="deposit-title" className="text-sm wallet-minter-title">
        Your deposit address
      </h3>
      <p className="text-xs muted">
        <code className="code-inline">get_btc_address</code> is an update the
        registry marks idempotent, so the page reads it with{" "}
        <code className="code-inline">{'{ update: "idempotent" }'}</code>. It
        still needs you signed in: the address belongs to your principal.
      </p>
      {!signedIn ? (
        <p className="text-sm muted">Sign in to get your address.</p>
      ) : address.data !== undefined ? (
        <div className="stack-xs">
          <div className="row-sm">
            <code className="mono break-all wallet-address">
              {address.data}
            </code>
            <CopyButton text={address.data} label="Copy address" iconOnly />
          </div>
          <CacheKeyPanel
            queryKey={client.queryKey(minter, "get_btc_address", arg)}
          />
        </div>
      ) : address.isError ? (
        <Notice tone="danger" title="No address">
          <p className="break-all">{address.error.message}</p>
        </Notice>
      ) : (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setAsked(true)}
          disabled={address.isFetching}
        >
          {address.isFetching && (
            <Spinner size="sm" label="Asking the minter" />
          )}
          {address.isFetching
            ? "Asking the minter…"
            : "Show my deposit address"}
        </button>
      )}
    </section>
  )
}

function MinterLimits(): ReactElement {
  const client = useClient()
  const info = useQuery(
    client.queryOptions(minterCanister(client), "get_minter_info")
  )
  return (
    <section className="stack-sm" aria-labelledby="limits-title">
      <h3 id="limits-title" className="text-sm wallet-minter-title">
        Limits
      </h3>
      {info.data !== undefined ? (
        <dl className="kv kv-compact">
          <dt>Min. withdrawal</dt>
          <dd className="tabular">{btc(info.data.retrieve_btc_min_amount)}</dd>
          <dt>Min. deposit</dt>
          <dd className="tabular">
            {info.data.deposit_btc_min_amount === null
              ? "Not set"
              : btc(info.data.deposit_btc_min_amount)}
          </dd>
          <dt>Check fee</dt>
          <dd className="tabular">{btc(info.data.kyt_fee)}</dd>
          <dt>Confirmations</dt>
          <dd className="tabular">{info.data.min_confirmations}</dd>
        </dl>
      ) : info.isError ? (
        <p className="text-sm muted break-all">{info.error.message}</p>
      ) : (
        <Skeleton height="4.5rem" />
      )}
    </section>
  )
}

/** The amount text as satoshis, or why it is not one. */
function satoshis(text: string): { sats?: bigint; problem?: string } {
  if (text.trim() === "") return {}
  try {
    const sats = parseUnits(text.trim(), BTC_DECIMALS)
    if (sats > NAT64_MAX) return { problem: "Larger than a nat64 can hold." }
    return { sats }
  } catch {
    return { problem: "A plain decimal amount, at most 8 decimals: 0.001" }
  }
}

function WithdrawalFee(): ReactElement {
  const client = useClient()
  const ids = useId()
  const [text, setText] = useState("0.001")
  const parsed = satoshis(text)
  const fee = useQuery(
    client.queryOptions(
      minterCanister(client),
      "estimate_withdrawal_fee",
      parsed.sats === undefined ? skipToken : { amount: parsed.sats }
    )
  )
  return (
    <section className="stack-sm" aria-labelledby="fee-title">
      <h3 id="fee-title" className="text-sm wallet-minter-title">
        Withdrawal fee estimate
      </h3>
      <div className="field">
        <label htmlFor={`${ids}-amount`} className="field-label">
          Amount
        </label>
        <div className="input-group">
          <input
            id={`${ids}-amount`}
            className="input mono"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={parsed.problem !== undefined}
            aria-describedby={`${ids}-amount-hint`}
          />
          <span className="input-addon">BTC</span>
        </div>
        <p
          id={`${ids}-amount-hint`}
          className={
            parsed.problem === undefined ? "field-hint" : "field-error"
          }
        >
          {parsed.problem ?? "Parsed with parseUnits: exact, never a float."}
        </p>
      </div>
      {fee.data !== undefined && parsed.sats !== undefined ? (
        <dl className="kv kv-compact" aria-live="polite">
          <dt>Minter fee</dt>
          <dd className="tabular">{btc(fee.data.minter_fee)}</dd>
          <dt>Bitcoin fee</dt>
          <dd className="tabular">{btc(fee.data.bitcoin_fee)}</dd>
        </dl>
      ) : fee.isError ? (
        <p className="text-sm muted break-all">{fee.error.message}</p>
      ) : fee.isFetching ? (
        <Skeleton height="2.5rem" />
      ) : null}
    </section>
  )
}
