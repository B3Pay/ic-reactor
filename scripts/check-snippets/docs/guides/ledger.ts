// The guides' `./ledger`: the module the Getting started and The client
// pages show as `src/ledger.ts`, the same as the guide's (packages/core/llms.txt).
// A page that shows another `src/ledger.ts` must keep this file in step.
import { createClient } from "@ic-reactor/core"
import { actor, type Actor } from "../../app/generated/icrc1"

export const client = createClient({ network: "ic", identity: "anonymous" })
export const ledger = client.canister<Actor>(actor, {
  id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
})
