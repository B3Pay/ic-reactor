// Scenario 2: Internet Identity, through `@icp-sdk/auth` 10's `AuthClient`.
//
// An `AuthClient` is an `AuthLike` as it is: the client reads its
// `getStatus()`, `getPrincipal()` and `getIdentity()`, follows its
// `subscribe()`, forwards `signIn()`/`signOut()` to it, and disposes it with
// itself. All this module decides is which Internet Identity it talks to.
//
// On mainnet that is the AuthClient's default (id.ai). On a local page it is
// the one `ii: true` in icp.yaml installs on the local network, named by two
// values, because AuthClient 10 derives nothing from a URL:
//
// - the page a person signs in on: the ic_env cookie's
//   INTERNET_IDENTITY_PROVIDER, which @ic-reactor/vite-plugin sets to
//   http://id.ai.localhost:<gateway port>/authorize;
// - the canister that mints the session's delegations: Internet Identity's
//   backend, installed at its mainnet id, rdmx6-jaaaa-aaaaa-aaadq-cai.
//
// AuthClient makes those mint calls itself, so it gets the local network too:
// the page's origin (the dev server proxies /api to the gateway) and the
// network's root key from the cookie, which a local page trusts.
//
// The local Internet Identity is a test build: where mainnet's makes a
// passkey, it asks for a seed index, and the same number is the same
// identity every time (its `config` query says
// `dummy_auth = opt opt record { prompt_for_index = true }`). Nothing here
// depends on that; it is what a person sees in the window it opens.
import { AuthClient, type AuthClientCreateOptions } from "@icp-sdk/auth/client"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import { isLocalPage, type PageLocation } from "./local-page.ts"

/** Internet Identity's backend: the same id on a local network as on mainnet. */
export const LOCAL_II_CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/** Where the local Internet Identity is when the cookie does not say. */
export const LOCAL_II_AUTHORIZE = "http://id.ai.localhost:8000/authorize"

/** The ic_env entries this module reads. */
export interface IdentityEnv {
  readonly IC_ROOT_KEY?: Uint8Array
  readonly INTERNET_IDENTITY_PROVIDER?: string
}

/** The `AuthClient` options for a page at `page`, given its ic_env cookie. */
export function internetIdentityOptions(
  page: PageLocation,
  env: IdentityEnv | undefined
): AuthClientCreateOptions {
  // A deployed page signs in with mainnet's Internet Identity.
  if (!isLocalPage(page)) return {}
  return {
    identityProvider: {
      authorizeUrl: env?.INTERNET_IDENTITY_PROVIDER ?? LOCAL_II_AUTHORIZE,
      canisterId: LOCAL_II_CANISTER,
    },
    agentOptions:
      env?.IC_ROOT_KEY === undefined
        ? { host: page.origin, shouldFetchRootKey: true }
        : { host: page.origin, rootKey: env.IC_ROOT_KEY },
  }
}

/** The Internet Identity sign-in of this page. Browser only. */
export const createInternetIdentity = (): AuthClient =>
  new AuthClient(
    internetIdentityOptions(window.location, safeGetCanisterEnv<IdentityEnv>())
  )
