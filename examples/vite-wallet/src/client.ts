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
//
// Scenario 2: Internet Identity, through `@icp-sdk/auth` 10's `AuthClient`,
// an `AuthLike` as it is. The factory is handed the client's network under
// AuthClient's own option names, so `new AuthClient(network)` is all it takes:
//
// - on a local page, the ic_env cookie's INTERNET_IDENTITY_PROVIDER, which
//   @ic-reactor/vite-plugin sets to icp-cli's built-in Internet Identity
//   (`ii: true` in icp.yaml) at http://id.ai.localhost:<gateway port>/authorize,
//   with its backend's id, rdmx6-jaaaa-aaaaa-aaadq-cai; and for the mint
//   calls the page's origin (the dev server proxies /api) and the cookie's
//   root key;
// - on a deployed page, mainnet's Internet Identity (AuthClient's defaults).
//
// The local Internet Identity is a test build: where mainnet's makes a
// passkey, it asks for a seed index, and the same number is the same
// identity every time. Nothing here depends on that; it is what a person sees
// in the window it opens.
import { createClient, type Client } from "@ic-reactor/core"
import { AuthClient } from "@icp-sdk/auth/client"
import type { DevAccounts } from "./auth/dev-accounts.ts"
import { createWalletAuth } from "./auth/wallet-auth.ts"

export function createWalletClient(devAccounts?: DevAccounts): Client {
  return createClient({
    network: "env",
    auth: (network) =>
      createWalletAuth({
        internetIdentity: new AuthClient(network),
        devAccounts,
      }),
  })
}
