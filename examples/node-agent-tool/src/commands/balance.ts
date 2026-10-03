// Scenario 4, direct calls (no cache): `balance <principal>`.
//
// The owner is typed text, so it becomes a Principal through `principal(text)`
// (src/input.ts) or is refused before anything is sent. The balance comes
// back in base units and is shown with `formatUnits`, never `Number()`.
//
// With `--certified` the balance is read through the certified canister
// object for the same id (`{ id, certified: true }`), while the decimals and
// the symbol, which only label it, stay plain queries: the output says which
// read was which.
import type { Context } from "../context.ts"
import { EXIT_CODES } from "../failure.ts"
import { principalArg, subaccountArg, toHex } from "../input.ts"
import { ledgerOn } from "../ledgers.ts"
import { amount, rows } from "../output.ts"

export async function balance(
  ctx: Context,
  ownerText: string,
  options: { subaccount: string | undefined; certified: boolean }
): Promise<number> {
  const account = {
    owner: principalArg(ownerText, "owner"),
    subaccount:
      options.subaccount === undefined
        ? null
        : subaccountArg(options.subaccount, "--subaccount"),
  }
  const plain = ledgerOn(ctx.client, ctx.ledger.id)
  const source = options.certified
    ? ledgerOn(ctx.client, ctx.ledger.id, true)
    : plain
  const [units, decimals, symbol] = await Promise.all([
    source.icrc1_balance_of(account),
    plain.icrc1_decimals(),
    plain.icrc1_symbol(),
  ])
  const shown = amount(units, decimals)
  const how = options.certified ? "certified" : "query"
  ctx.out.result(
    {
      ok: true,
      command: "balance",
      network: ctx.client.network,
      ledger: { id: ctx.ledger.id, name: ctx.ledger.name },
      account,
      balance: shown,
      symbol,
      decimals,
      reads: {
        icrc1_balance_of: how,
        icrc1_decimals: "query",
        icrc1_symbol: "query",
      },
    },
    rows([
      [
        "account",
        account.subaccount === null
          ? account.owner
          : `${account.owner} subaccount ${toHex(account.subaccount)}`,
      ],
      ["balance", `${shown.tokens} ${symbol} (${units} base units)`],
      [
        "reads",
        options.certified
          ? "icrc1_balance_of certified (a replicated call); icrc1_decimals and icrc1_symbol plain queries"
          : "plain queries, not certified (--certified to certify the balance)",
      ],
    ])
  )
  return EXIT_CODES.ok
}
