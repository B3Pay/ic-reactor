// Scenario 4, direct calls (no cache): `info`.
//
// A one-shot tool has nothing to cache, so it calls the canister's methods
// directly: `await ledger.icrc1_fee()`. A direct call never touches the
// client's QueryClient. The five reads go out in parallel.
//
// `--certified` reads through `client.canister(actor, { id, certified: true })`:
// the same methods, sent as replicated calls whose replies come with a
// certificate the client checks against the root key. Slower, and a reply a
// single replica could not have made up.
import type { Context } from "../context.ts"
import { EXIT_CODES } from "../failure.ts"
import { ledgerOn } from "../ledgers.ts"
import { amount, rows } from "../output.ts"

const READS = [
  "icrc1_name",
  "icrc1_symbol",
  "icrc1_decimals",
  "icrc1_fee",
  "icrc1_total_supply",
] as const

export async function info(
  ctx: Context,
  options: { certified: boolean }
): Promise<number> {
  const ledger = ledgerOn(ctx.client, ctx.ledger.id, options.certified)
  const [name, symbol, decimals, fee, totalSupply] = await Promise.all([
    ledger.icrc1_name(),
    ledger.icrc1_symbol(),
    ledger.icrc1_decimals(),
    ledger.icrc1_fee(),
    ledger.icrc1_total_supply(),
  ])
  const how = options.certified ? "certified" : "query"
  ctx.out.result(
    {
      ok: true,
      command: "info",
      network: ctx.client.network,
      ledger: { id: ctx.ledger.id, name: ctx.ledger.name },
      name,
      symbol,
      decimals,
      fee: amount(fee, decimals),
      totalSupply: amount(totalSupply, decimals),
      reads: Object.fromEntries(READS.map((method) => [method, how])),
    },
    rows([
      [
        "ledger",
        `${ctx.ledger.name ?? "ledger"} ${ctx.ledger.id} on ${ctx.client.network}`,
      ],
      ["name", name],
      ["symbol", symbol],
      ["decimals", String(decimals)],
      ["fee", `${amount(fee, decimals).tokens} ${symbol} (${fee} base units)`],
      ["total supply", `${amount(totalSupply, decimals).tokens} ${symbol}`],
      [
        "reads",
        options.certified
          ? `${READS.length} replicated calls in parallel: certified replies`
          : `${READS.length} queries in parallel, not certified (--certified to certify them)`,
      ],
    ])
  )
  return EXIT_CODES.ok
}
