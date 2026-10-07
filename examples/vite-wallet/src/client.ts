// Scenario 1: the wallet's one client, on the page's own network.
//
// `network: "env"` sends every call through the page's origin, where the dev
// server (and, deployed, the asset canister) answers /api. On a local page it
// takes the network's root key and canister ids from the ic_env cookie that
// @ic-reactor/vite-plugin sets, so `{ name: "backend" }` finds the id `icp
// deploy` gave the backend (see use-canisters.ts). Nothing here names a host,
// a port or an id.
//
// `auth` is a factory: the client calls it once, on first use, and only in a
// browser, and disposes what it returns with itself. `App.tsx` calls this
// from `ReactorProvider`'s factory, so the provider owns the client: one per
// mounted tree, which is one per tab.
import { createClient, type Client } from "@ic-reactor/core"
import type { DevAccounts } from "./auth/dev-accounts.ts"
import { createInternetIdentity } from "./auth/internet-identity.ts"
import { createWalletAuth } from "./auth/wallet-auth.ts"

export function createWalletClient(devAccounts?: DevAccounts): Client {
  return createClient({
    network: "env",
    auth: () =>
      createWalletAuth({
        internetIdentity: createInternetIdentity(),
        devAccounts,
      }),
  })
}
