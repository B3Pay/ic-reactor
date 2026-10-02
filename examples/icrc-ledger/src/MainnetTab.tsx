import { isPrincipal, principal } from "@candid-core/schema"
import { formatUnits, type Canister } from "@ic-reactor/core"
import { ReactorProvider, useClient } from "@ic-reactor/react"
import { skipToken, useQuery } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import type { Actor } from "./canisters/icrc1.ts"
import { ErrorPanel, type ShownError } from "./ErrorPanel.tsx"
import {
  metadataText,
  parseSubaccount,
  principalProblem,
  toHex,
} from "./format.ts"
import { ICP_LEDGER, ledgerOn, mainnetClient } from "./ledger.ts"

const PRESETS = [
  { label: "ICP", id: ICP_LEDGER },
  { label: "ckBTC", id: "mxzaz-hqaaa-aaaar-qaada-cai" },
  // Not a ledger: every read is rejected, which shows the error panel.
  { label: "Not a ledger", id: "rrkah-fqaaa-aaaaa-aaaaq-cai" },
]

// The cycles minting canister holds some ICP, so the first lookup has an answer.
const SAMPLE_OWNER = "rkp4c-7iaaa-aaaaa-aaaca-cai"

type Ledger = Canister<Actor>

/** The Mainnet tab: anonymous reads of an ICRC-1 ledger on the IC. */
export function MainnetTab() {
  return (
    <ReactorProvider client={mainnetClient}>
      <Explorer />
    </ReactorProvider>
  )
}

function Explorer() {
  const client = useClient()
  const [text, setText] = useState(ICP_LEDGER)
  const [certified, setCertified] = useState(false)
  const id = text.trim()
  // `client.canister()` returns the same object for the same id, so it is
  // made here, in render; a certified ledger is another object, other keys.
  const ledger = isPrincipal(id) ? ledgerOn(client, id, certified) : undefined

  return (
    <>
      <section>
        <label htmlFor="ledger">Ledger canister id</label>
        <input
          id="ledger"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={ledger === undefined}
        />
        <div className="row">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setText(preset.id)}
              aria-pressed={id === preset.id}
            >
              {preset.label}
            </button>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={certified}
              onChange={(e) => setCertified(e.target.checked)}
            />
            Certified reads
          </label>
        </div>
        {ledger === undefined && (
          <p className="error">{principalProblem(id)}</p>
        )}
        {certified && (
          <p className="muted">
            Each query goes through consensus as a replicated call, so its reply
            is certified: slower, and cached under keys of its own.
          </p>
        )}
      </section>
      {ledger && (
        <>
          <Token ledger={ledger} />
          <Balance ledger={ledger} />
        </>
      )}
    </>
  )
}

/** A row of the token table: the answer, `loading`, or the error panel. */
function Row(props: {
  label: string
  method: string
  read: { isPending: boolean; error: ShownError | null }
  children: ReactNode
}) {
  const { label, method, read, children } = props
  return (
    <div className="kv">
      <dt>
        {label} <code>{method}</code>
      </dt>
      <dd>
        {read.error ? (
          <ErrorPanel error={read.error} />
        ) : read.isPending ? (
          <span className="muted">loading</span>
        ) : (
          children
        )}
      </dd>
    </div>
  )
}

function Token({ ledger }: { ledger: Ledger }) {
  const client = useClient()
  const name = useQuery(client.queryOptions(ledger, "icrc1_name"))
  const symbol = useQuery(client.queryOptions(ledger, "icrc1_symbol"))
  const decimals = useQuery(client.queryOptions(ledger, "icrc1_decimals"))
  const fee = useQuery(client.queryOptions(ledger, "icrc1_fee"))
  const supply = useQuery(client.queryOptions(ledger, "icrc1_total_supply"))
  const minter = useQuery(client.queryOptions(ledger, "icrc1_minting_account"))
  const metadata = useQuery(client.queryOptions(ledger, "icrc1_metadata"))

  // Amounts are bigints in base units; `decimals` (a number) places the point.
  const amount = (value: bigint) =>
    decimals.data === undefined
      ? `${value} base units`
      : `${formatUnits(value, decimals.data)} ${symbol.data ?? ""}`

  return (
    <section>
      <h2>Token</h2>
      <dl>
        <Row label="Name" method="icrc1_name" read={name}>
          {name.data}
        </Row>
        <Row label="Symbol" method="icrc1_symbol" read={symbol}>
          {symbol.data}
        </Row>
        <Row label="Decimals" method="icrc1_decimals" read={decimals}>
          {decimals.data}
        </Row>
        <Row label="Fee" method="icrc1_fee" read={fee}>
          {fee.data !== undefined && amount(fee.data)}
        </Row>
        <Row label="Total supply" method="icrc1_total_supply" read={supply}>
          {supply.data !== undefined && amount(supply.data)}
        </Row>
        <Row
          label="Minting account"
          method="icrc1_minting_account"
          read={minter}
        >
          {minter.data === null ? (
            "none"
          ) : (
            <code>
              {minter.data?.owner}
              {minter.data?.subaccount && `.${toHex(minter.data.subaccount)}`}
            </code>
          )}
        </Row>
        <Row label="Metadata" method="icrc1_metadata" read={metadata}>
          <ul className="metadata">
            {metadata.data?.map(([key, value]) => (
              <li key={key}>
                <code>{key}</code> {metadataText(value)}
              </li>
            ))}
          </ul>
        </Row>
      </dl>
    </section>
  )
}

function Balance({ ledger }: { ledger: Ledger }) {
  const client = useClient()
  const [owner, setOwner] = useState(SAMPLE_OWNER)
  const [subaccountText, setSubaccountText] = useState("")
  const ownerText = owner.trim()
  const subaccount = parseSubaccount(subaccountText)

  // Until both inputs are valid there is nothing to ask: skipToken, not a
  // half-made account.
  const account =
    isPrincipal(ownerText) && subaccount.ok
      ? { owner: principal(ownerText), subaccount: subaccount.bytes }
      : skipToken
  const balance = useQuery(
    client.queryOptions(ledger, "icrc1_balance_of", account)
  )
  const decimals = useQuery(client.queryOptions(ledger, "icrc1_decimals"))
  const symbol = useQuery(client.queryOptions(ledger, "icrc1_symbol"))

  return (
    <section>
      <h2>Balance</h2>
      <label htmlFor="owner">Owner principal</label>
      <input
        id="owner"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={!isPrincipal(ownerText)}
      />
      {!isPrincipal(ownerText) && (
        <p className="error">{principalProblem(ownerText)}</p>
      )}
      <label htmlFor="subaccount">
        Subaccount (hex, up to 64 digits, optional)
      </label>
      <input
        id="subaccount"
        value={subaccountText}
        onChange={(e) => setSubaccountText(e.target.value)}
        placeholder="empty is the default account; 1 is subaccount 1"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={!subaccount.ok}
      />
      {!subaccount.ok && <p className="error">{subaccount.reason}</p>}

      <div className="result">
        {account === skipToken ? (
          <p className="muted">Nothing is asked until both fields are valid.</p>
        ) : balance.error ? (
          <ErrorPanel error={balance.error} />
        ) : balance.data !== undefined ? (
          <>
            <p className="big">
              {decimals.data === undefined
                ? `${balance.data} base units`
                : formatUnits(balance.data, decimals.data)}{" "}
              {symbol.data}
            </p>
            <p className="muted">{balance.data.toString()} base units, exact</p>
          </>
        ) : (
          <p className="muted">loading</p>
        )}
      </div>
    </section>
  )
}
