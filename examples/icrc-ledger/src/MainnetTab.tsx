import { isPrincipal, principal } from "@candid-core/schema"
import { formatUnits, type Canister } from "@ic-reactor/core"
import { ReactorProvider, useClient } from "@ic-reactor/react"
import { skipToken, useQueries, useQuery } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import {
  archivedRangeOptions,
  blockRows,
  blocksLedgerOn,
  blockTime,
  operationOf,
} from "./blocks.ts"
import type { QueryArchiveError } from "./canisters/icp_ledger.ts"
import type { Actor } from "./canisters/icrc1.ts"
import { ErrorPanel, type ShownError } from "./ErrorPanel.tsx"
import {
  metadataText,
  parseSubaccount,
  principalProblem,
  shortPrincipal,
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
          {id === ICP_LEDGER && <Blocks certified={certified} />}
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

/** How many blocks the Blocks section reads at a time. */
const PAGE = 5n

/** What an archive's `QueryArchiveError` means, in a sentence. */
function describeArchiveError(err: QueryArchiveError): string {
  switch (err.tag) {
    case "BadFirstBlockIndex":
      return `This archive starts at block ${err.value.first_valid_index}, after the ${err.value.requested_index} asked for.`
    case "Other":
      return `Error ${err.value.error_code}: ${err.value.error_message}`
  }
}

/** A block index typed as text, or `undefined` for anything but digits. */
const blockIndex = (text: string): bigint | undefined =>
  /^\d{1,20}$/.test(text.trim()) ? BigInt(text.trim()) : undefined

/**
 * The ICP ledger's blocks. `query_blocks` answers with the blocks the ledger
 * still holds and, for each older range, a func reference to the archive
 * canister that holds it; `client.func()` calls each one.
 */
function Blocks({ certified }: { certified: boolean }) {
  const client = useClient()
  const ledger = blocksLedgerOn(client, certified)
  const [startText, setStartText] = useState("0")
  const start = blockIndex(startText)
  const args = start === undefined ? undefined : { start, length: PAGE }

  // An empty range asks only for the chain's length: where "Latest" is.
  const tip = useQuery(
    client.queryOptions(ledger, "query_blocks", { start: 0n, length: 0n })
  )
  const chain = tip.data?.chain_length
  const reply = useQuery(
    client.queryOptions(ledger, "query_blocks", args ?? skipToken)
  )
  // One read per archived range the reply names, each through client.func().
  const archived = useQueries({
    queries:
      args && reply.data
        ? reply.data.archived_blocks.map((range) =>
            archivedRangeOptions(client, ledger, args, range)
          )
        : [],
  })
  const failed = archived.find((read) => read.error !== null)?.error
  const rows = reply.data
    ? blockRows(
        reply.data,
        archived.map((read) => read.data)
      )
    : []
  const go = (to: bigint) => setStartText((to < 0n ? 0n : to).toString())

  return (
    <section>
      <h2>Blocks</h2>
      <p className="muted">
        <code>query_blocks</code> of the ICP ledger, {PAGE.toString()} at a
        time. The ledger keeps only its newest blocks: for older ones its reply
        carries a callback, an archive canister and a method, which{" "}
        <code>client.func(QueryArchiveFn, range.callback)</code> calls.
      </p>
      <label htmlFor="block-start">First block</label>
      <input
        id="block-start"
        value={startText}
        onChange={(e) => setStartText(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={start === undefined}
      />
      {start === undefined && (
        <p className="error">A block index is digits only.</p>
      )}
      <div className="row">
        <button
          type="button"
          onClick={() => go(0n)}
          aria-pressed={start === 0n}
        >
          Genesis (archived)
        </button>
        <button
          type="button"
          disabled={chain === undefined}
          onClick={() => chain !== undefined && go(chain - PAGE)}
          aria-pressed={chain !== undefined && start === chain - PAGE}
        >
          Latest (on the ledger)
        </button>
        <button
          type="button"
          disabled={start === undefined || start === 0n}
          onClick={() => start !== undefined && go(start - PAGE)}
        >
          Earlier
        </button>
        <button
          type="button"
          disabled={
            start === undefined || chain === undefined || start + PAGE >= chain
          }
          onClick={() => start !== undefined && go(start + PAGE)}
        >
          Later
        </button>
      </div>
      {chain !== undefined && (
        <p className="muted">The chain has {chain.toString()} blocks.</p>
      )}
      <div className="result">
        {start === undefined ? null : reply.error ? (
          <ErrorPanel error={reply.error} />
        ) : failed ? (
          <ErrorPanel
            error={failed}
            detail={
              failed.kind === "canister_err"
                ? describeArchiveError(failed.err)
                : undefined
            }
          />
        ) : reply.isPending ? (
          <p className="muted">loading</p>
        ) : rows.length === 0 && !archived.some((read) => read.isPending) ? (
          <p className="muted">No blocks from {start.toString()} on.</p>
        ) : (
          <table className="log blocks">
            <thead>
              <tr>
                <th>Block</th>
                <th>Time (UTC)</th>
                <th>Operation</th>
                <th>Amount</th>
                <th>Answered by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ index, block, from }) => {
                const { kind, e8s } = operationOf(block)
                return (
                  <tr key={index.toString()}>
                    <td>{index.toString()}</td>
                    <td>{blockTime(block)}</td>
                    <td>{kind}</td>
                    <td>
                      {e8s === undefined ? "" : `${formatUnits(e8s, 8)} ICP`}
                    </td>
                    <td>
                      {from === ICP_LEDGER ? (
                        "the ledger"
                      ) : (
                        <>
                          archive{" "}
                          <code title={from}>{shortPrincipal(from)}</code>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
              {archived.some((read) => read.isPending) && (
                <tr>
                  <td colSpan={5} className="muted">
                    reading the archive…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
