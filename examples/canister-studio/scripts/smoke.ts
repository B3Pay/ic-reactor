// Mainnet smoke check, never part of `pnpm test`: reads the typed canisters
// through the generated modules, and checks each committed .did against the
// interface its canister publishes today. Node strips the types itself (22.18
// or newer): no bundler, no loader.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { checkCompatible } from "@candid-core/cli"
import { principal } from "@candid-core/schema"
import { createClient, formatUnits, isReactorError } from "@ic-reactor/core"
import { HttpAgent, StatePaths } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import {
  actor as minterActor,
  type Actor as MinterActor,
} from "../src/canisters/ckbtc_minter.ts"
import {
  actor as icrc1Actor,
  type Actor as Icrc1Actor,
} from "../src/canisters/icrc1.ts"

// The registry's canisters (src/lib/registry.ts, which imports .did files
// with Vite's `?raw` and so cannot load in plain Node).
const TYPED = [
  { id: "ryjl3-tyaaa-aaaaa-aaaba-cai", did: "did/icp_ledger.did" },
  { id: "mxzaz-hqaaa-aaaar-qaada-cai", did: "did/icrc1.did" },
  { id: "ss2fx-dyaaa-aaaar-qacoq-cai", did: "did/icrc1.did" },
  { id: "mqygn-kiaaa-aaaar-qaadq-cai", did: "did/ckbtc_minter.did" },
] as const
const LEDGERS = TYPED.slice(0, 3)
const CKBTC_LEDGER = TYPED[1].id
const CKBTC_MINTER = TYPED[3].id

// 1. Each committed .did against the live, certified candid:service.
const agent = await HttpAgent.create({ host: "https://icp-api.io" })
for (const { id, did } of TYPED) {
  const path = StatePaths.canisterCandid(Principal.fromText(id))
  const { values } = await agent.readState(
    { canisterId: Principal.fromText(id) },
    { paths: [path] }
  )
  const live = values.get(path)
  assert.equal(typeof live, "string", `${id} publishes no candid:service`)
  const written = await readFile(new URL(`../${did}`, import.meta.url), "utf8")
  const report = await checkCompatible(written, live as string)
  assert.ok(report.ok, `${did} vs ${id}: the check failed`)
  console.log(
    `${did.padEnd(20)} vs ${id}: ${report.compatible ? "compatible" : "INCOMPATIBLE"}`
  )
  assert.ok(report.compatible, JSON.stringify(report.diagnostics))
}

// 2. The ledgers' metadata through the generated icrc1 module.
const client = createClient({ network: "ic", identity: "anonymous" })
for (const { id } of LEDGERS) {
  const ledger = client.canister<Icrc1Actor>(icrc1Actor, { id })
  const [symbol, decimals, fee, supply] = await Promise.all([
    ledger.icrc1_symbol(),
    ledger.icrc1_decimals(),
    ledger.icrc1_fee(),
    ledger.icrc1_total_supply(),
  ])
  console.log(
    `${symbol.padEnd(6)} decimals ${decimals}, fee ${formatUnits(fee, decimals)}, supply ${formatUnits(supply, decimals)}`
  )
  assert.equal(typeof supply, "bigint")
}

// 3. The minter's info, a query of the full ckbtc_minter module.
const minter = client.canister<MinterActor>(minterActor, { id: CKBTC_MINTER })
const info = await minter.get_minter_info()
console.log(`ckBTC minter   min retrieval ${info.retrieve_btc_min_amount} sat`)
assert.equal(typeof info.retrieve_btc_min_amount, "bigint")

// 4. The client is anonymous: it refuses a transfer before sending anything.
try {
  await client
    .canister<Icrc1Actor>(icrc1Actor, { id: CKBTC_LEDGER })
    .icrc1_transfer({
      to: { owner: principal("rrkah-fqaaa-aaaaa-aaaaq-cai"), subaccount: null },
      amount: 1n,
      fee: null,
      memo: null,
      from_subaccount: null,
      created_at_time: null,
    })
  assert.fail("an anonymous client sent a transfer")
} catch (error) {
  assert.ok(isReactorError(error))
  assert.equal(error.kind, "unauthenticated")
  console.log("transfer       refused:", error.kind, error.code)
}

client.dispose()
console.log("ok")
