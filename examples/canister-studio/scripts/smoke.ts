// Mainnet smoke check, never part of `pnpm test`: runs the server's live
// interface loader against real canisters, calls one through the interface
// it compiled, checks each committed .did against the interface its canister
// publishes today, and reads the typed canisters through the generated
// modules. Node strips the types itself (22.18 or newer): no bundler, no
// loader.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { principal, serviceMethods } from "@meantjs/schema"
import { schemaFromContract } from "@meantjs/schema/contract"
import { createClient, formatUnits, isReactorError } from "@ic-reactor/core"
import {
  actor as minterActor,
  type Actor as MinterActor,
} from "../src/canisters/ckbtc_minter.ts"
import {
  actor as icrc1Actor,
  type Actor as Icrc1Actor,
} from "../src/canisters/icrc1.ts"
import {
  compatibilityForDids,
  loadLiveInterface,
  moduleForDid,
  projectionForDid,
} from "../src/interface/live-candid.server.ts"
import type { InterfacePayload } from "../src/interface/types.ts"
import type { DynActor } from "../src/lib/reactor.ts"

// The registry's canisters (src/lib/registry.ts, which imports .did files
// with Vite's `?raw` and so cannot load in plain Node).
const TYPED = [
  { id: "ryjl3-tyaaa-aaaaa-aaaba-cai", did: "did/icp_ledger.did" },
  { id: "mxzaz-hqaaa-aaaar-qaada-cai", did: "did/icrc1.did" },
  { id: "ss2fx-dyaaa-aaaar-qacoq-cai", did: "did/icrc1.did" },
  { id: "mqygn-kiaaa-aaaar-qaadq-cai", did: "did/ckbtc_minter.did" },
] as const
const ICP_LEDGER = TYPED[0].id
const LEDGERS = TYPED.slice(0, 3)
const CKBTC_LEDGER = TYPED[1].id
const CKBTC_MINTER = TYPED[3].id
// No candid:service metadata: its interface comes from the uncertified query.
const CAP_ROUTER = "lj532-6iaaa-aaaah-qcc7a-cai"
// candid:service readable by its controllers only.
const NNS_LIFELINE = "rno2w-sqaaa-aaaaa-aaacq-cai"

type OkPayload = Extract<InterfacePayload, { ok: true }>

function expectOk(p: InterfacePayload): OkPayload {
  assert.ok(p.ok, p.ok ? "" : `${p.canisterId}: ${p.code}: ${p.message}`)
  return p
}

async function timed<T>(work: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now()
  const result = await work()
  return [result, Math.round(performance.now() - start)]
}

function methodCounts(p: OkPayload): string {
  const built = schemaFromContract(
    JSON.parse(p.envelopeJson ?? "null") as unknown
  )
  assert.ok(built.ok && built.actor !== undefined, "the envelope does not load")
  const counts = new Map<string, number>()
  for (const m of serviceMethods(built.actor).values()) {
    counts.set(m.mode, (counts.get(m.mode) ?? 0) + 1)
  }
  return [...counts].map(([mode, n]) => `${n} ${mode}`).join(", ")
}

// 1. The ICP ledger through the server loader: cold, then from the cache.
const [cold, coldMs] = await timed(() => loadLiveInterface(ICP_LEDGER))
const icp = expectOk(cold)
assert.deepEqual(icp.source.kind, "metadata")
assert.equal(icp.cache, "miss")
const [warm, warmMs] = await timed(() => loadLiveInterface(ICP_LEDGER))
assert.equal(expectOk(warm).cache, "hit")
console.log(
  `ICP ledger     certified metadata, ${icp.did.length} B .did, ${icp.envelopeJson?.length} B envelope; ${methodCounts(icp)}`
)
console.log(
  `               cold ${coldMs} ms, warm ${warmMs} ms (cache ${warm.ok ? warm.cache : "-"})`
)

// 2. The server's other compile steps over the .did it read.
const module = await moduleForDid(icp.did)
assert.ok(module.ok, module.ok ? "" : module.message)
const projection = await projectionForDid(icp.did, [
  "icrc1_symbol",
  "icrc1_balance_of",
])
assert.ok(projection.ok, projection.ok ? "" : projection.message)
console.log(
  `               module ${module.module.length} B; projection of ${projection.methods.join(", ")}: ${projection.did.length} B`
)

// 3. A read through the compiled interface, built as the method runner
// builds it: the query options of a `Canister<DynActor>`, no arguments
// (`vars` undefined).
const client = createClient({ network: "ic", identity: "anonymous" })
const live = schemaFromContract(
  JSON.parse(icp.envelopeJson ?? "null") as unknown
)
assert.ok(live.ok && live.actor !== undefined)
const ledger = client.canister<DynActor>(live.actor, { id: ICP_LEDGER })
const symbol = await client.queryClient.fetchQuery(
  client.queryOptions(ledger, "icrc1_symbol", undefined)
)
assert.equal(symbol, "ICP")
console.log(
  `               icrc1_symbol() through the live interface: ${String(symbol)}`
)

// 4. The fallbacks and refusals.
const cap = expectOk(await loadLiveInterface(CAP_ROUTER))
assert.deepEqual(cap.source.kind, "tmp_hack")
assert.equal(cap.source.kind === "tmp_hack" && cap.source.certified, false)
console.log(
  `CAP router     tmp_hack, UNCERTIFIED, ${cap.did.length} B; ${methodCounts(cap)}`
)
for (const [id, code] of [
  [NNS_LIFELINE, "private_interface"],
  ["aaaaa-aa", "management_canister"],
  ["2vxsx-fae", "not_a_canister"],
  ["ryjl3-tyaaa-aaaaa-aaaba-caj", "invalid_canister_id"],
] as const) {
  const p = await loadLiveInterface(id)
  assert.ok(
    !p.ok && p.code === code,
    `${id}: expected ${code}, got ${p.ok ? "ok" : p.code}`
  )
  console.log(`${id.padEnd(28)} ${p.code}`)
}

// 5. Each committed .did against the live, certified candid:service.
for (const { id, did } of TYPED) {
  const payload = expectOk(await loadLiveInterface(id))
  const written = await readFile(new URL(`../${did}`, import.meta.url), "utf8")
  const report = await compatibilityForDids(written, payload.did)
  assert.ok(report.ok, report.ok ? "" : `${did} vs ${id}: ${report.message}`)
  console.log(
    `${did.padEnd(20)} vs ${id}: ${report.compatible ? "compatible" : "INCOMPATIBLE"} (cache ${payload.cache})`
  )
  assert.ok(report.compatible, JSON.stringify(report.diagnostics))
}

// 6. The ledgers' metadata through the generated icrc1 module.
for (const { id } of LEDGERS) {
  const typed = client.canister<Icrc1Actor>(icrc1Actor, { id })
  const [sym, decimals, fee, supply] = await Promise.all([
    typed.icrc1_symbol(),
    typed.icrc1_decimals(),
    typed.icrc1_fee(),
    typed.icrc1_total_supply(),
  ])
  console.log(
    `${sym.padEnd(6)} decimals ${decimals}, fee ${formatUnits(fee, decimals)}, supply ${formatUnits(supply, decimals)}`
  )
  assert.equal(typeof supply, "bigint")
}

// 7. The minter's info, a query of the full ckbtc_minter module.
const minter = client.canister<MinterActor>(minterActor, { id: CKBTC_MINTER })
const info = await minter.get_minter_info()
console.log(`ckBTC minter   min retrieval ${info.retrieve_btc_min_amount} sat`)
assert.equal(typeof info.retrieve_btc_min_amount, "bigint")

// 8. The client is anonymous: it refuses a transfer before sending anything.
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
