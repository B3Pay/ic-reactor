// What replaced the bare example's 176-line call layer: a client, and the
// ledger on it. Plain TypeScript, so scripts/smoke.ts runs it under Node.
import { createClient, type Client } from "@ic-reactor/core"
import { actor, type Actor } from "./canisters/icrc1.ts"

/** The ICP ledger's canister id on mainnet. */
export const ICP_LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"

/** A mainnet client that only reads: it refuses every update before sending. */
export const mainnetClient = (): Client =>
  createClient({ network: "ic", identity: "anonymous" })

/** The ledger at `id`; with `certified`, its queries come back certified. */
export const ledgerOn = (client: Client, id: string, certified = false) =>
  client.canister<Actor>(actor, { id, certified })
