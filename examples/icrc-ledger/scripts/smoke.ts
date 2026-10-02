// Reads the real ICP ledger on mainnet through the same src/ledger.ts the page
// uses. Node strips the types itself (22.18 or newer): no bundler, no loader.
import assert from "node:assert/strict"
import { principal } from "@candid-core/schema"
import { formatUnits, isReactorError } from "@ic-reactor/core"
import {
  archivedRangeOptions,
  blockRows,
  blocksLedgerOn,
  blockTime,
  operationOf,
} from "../src/blocks.ts"
import { ICP_LEDGER, ledgerOn, mainnetClient } from "../src/ledger.ts"

const NNS_GOVERNANCE = principal("rrkah-fqaaa-aaaaa-aaaaq-cai")
// The cycles minting canister holds some ICP.
const CYCLES_MINTING = principal("rkp4c-7iaaa-aaaaa-aaaca-cai")

const client = mainnetClient()
const ledger = ledgerOn(client, ICP_LEDGER)

const [name, symbol, decimals, fee, supply, minter, metadata] =
  await Promise.all([
    ledger.icrc1_name(),
    ledger.icrc1_symbol(),
    ledger.icrc1_decimals(),
    ledger.icrc1_fee(),
    ledger.icrc1_total_supply(),
    ledger.icrc1_minting_account(),
    ledger.icrc1_metadata(),
  ])
const tokens = (units: bigint) => `${formatUnits(units, decimals)} ${symbol}`

// Through the cache, as the page reads it.
const cmc = await client.queryClient.fetchQuery(
  client.queryOptions(ledger, "icrc1_balance_of", {
    owner: CYCLES_MINTING,
    subaccount: null,
  })
)
// Replicated, so the reply is certified.
const certifiedFee = await ledgerOn(client, ICP_LEDGER, true).icrc1_fee()

console.log("name          ", name)
console.log("symbol        ", symbol)
console.log("decimals      ", decimals)
console.log("fee           ", fee, `(${tokens(fee)})`)
console.log("certified fee ", certifiedFee)
console.log("total supply  ", supply, `(${tokens(supply)})`)
console.log("minting acct  ", minter?.owner ?? "none")
console.log("metadata      ", metadata.map(([key]) => key).join(", "))
console.log("CMC balance   ", cmc, `(${tokens(cmc)})`)

// The first blocks live in an archive canister: the ledger's reply names it
// and its method, and client.func() calls it, through the cache as the page.
const blocks = blocksLedgerOn(client)
const genesis = { start: 0n, length: 3n }
const page = await client.queryClient.fetchQuery(
  client.queryOptions(blocks, "query_blocks", genesis)
)
const archived = await Promise.all(
  page.archived_blocks.map((range) =>
    client.queryClient.fetchQuery(
      archivedRangeOptions(client, blocks, genesis, range)
    )
  )
)
const rows = blockRows(page, archived)
// The newest blocks the ledger still holds itself.
const latest = await blocks.query_blocks({
  start: page.chain_length - 2n,
  length: 2n,
})
console.log("chain length  ", page.chain_length)
for (const row of [...rows, ...blockRows(latest, [])]) {
  const { kind, e8s } = operationOf(row.block)
  console.log(
    `block ${row.index}`.padEnd(14),
    blockTime(row.block),
    kind,
    e8s === undefined ? "" : tokens(e8s),
    row.from === ICP_LEDGER ? "(the ledger)" : `(archive ${row.from})`
  )
}

// The client is anonymous: it refuses a transfer before sending anything.
try {
  await ledger.icrc1_transfer({
    to: { owner: NNS_GOVERNANCE, subaccount: null },
    amount: 1n,
    fee: null,
    memo: null,
    from_subaccount: null,
    created_at_time: null,
  })
  assert.fail("an anonymous client sent a transfer")
} catch (error) {
  assert.ok(isReactorError(error))
  console.log(
    "transfer      ",
    error.kind,
    `(mayHaveExecuted: ${error.mayHaveExecuted})`
  )
  assert.equal(error.kind, "unauthenticated")
}

// A canister that is not a ledger answers with a reject.
try {
  await ledgerOn(client, NNS_GOVERNANCE).icrc1_name()
  assert.fail("governance answered icrc1_name")
} catch (error) {
  assert.ok(isReactorError(error))
  console.log("not a ledger  ", error.kind, `(reject code ${error.rejectCode})`)
}

assert.equal(symbol, "ICP")
assert.equal(decimals, 8)
assert.equal(certifiedFee, fee)
assert.equal(typeof cmc, "bigint")
assert.deepEqual(
  rows.map((row) => row.index),
  [0n, 1n, 2n]
)
assert.ok(rows.every((row) => row.from !== ICP_LEDGER))
assert.equal(operationOf(rows[0]!.block).kind, "Mint")
assert.equal(latest.archived_blocks.length, 0)
client.dispose()
console.log("ok")
