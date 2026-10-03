// Scenario 3, many ledgers, one interface: every ICRC-1 ledger speaks the
// same `.did`, so one generated module (src/canisters/icrc1.ts, from
// icrc1.did) and one `Actor` type serve them all. Each ledger is
// `client.canister<Actor>(actor, { id })` on the same client; the client keeps
// one object per (service, target), so asking again costs nothing.
//
// `--ledger icp|ckbtc|cketh|<canister id>`; the ids are the mainnet ledgers'.
import { isPrincipal } from "@candid-core/schema"
import type { Canister, Client } from "@ic-reactor/core"
import { actor, type Actor } from "./canisters/icrc1.ts"
import { UsageError } from "./input.ts"

/** Mainnet ICRC-1 ledgers by name. */
export const LEDGERS = {
  icp: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  ckbtc: "mxzaz-hqaaa-aaaar-qaada-cai",
  cketh: "ss2fx-dyaaa-aaaar-qacoq-cai",
} as const

export type LedgerName = keyof typeof LEDGERS

/** A ledger, chosen on the command line. */
export interface LedgerChoice {
  /** The canister id. */
  readonly id: string
  /** Its name in {@link LEDGERS}, or `null` for an id given as is. */
  readonly name: LedgerName | null
  /** The flags that pick this ledger again, for a command printed to re-run. */
  readonly flags: readonly string[]
}

const isLedgerName = (text: string): text is LedgerName =>
  Object.hasOwn(LEDGERS, text)

/**
 * The ledger `--ledger` names: a name from {@link LEDGERS} or a canister id;
 * the ICP ledger when it is not given.
 *
 * @throws UsageError for anything else.
 */
export function ledgerFrom(flag: string | undefined): LedgerChoice {
  const text = flag ?? "icp"
  if (isLedgerName(text)) {
    return { id: LEDGERS[text], name: text, flags: ["--ledger", text] }
  }
  if (isPrincipal(text))
    return { id: text, name: null, flags: ["--ledger", text] }
  throw new UsageError(
    `--ledger ${JSON.stringify(text)} is not ${Object.keys(LEDGERS).join(", ")} or a canister id`
  )
}

/**
 * The ledger `id` on `client`. With `certified`, a second canister object for
 * the same id whose query methods go out as replicated calls, so their
 * replies are certified, and whose cache keys end in "certified".
 */
export const ledgerOn = (
  client: Client,
  id: string,
  certified = false
): Canister<Actor> => client.canister<Actor>(actor, { id, certified })
