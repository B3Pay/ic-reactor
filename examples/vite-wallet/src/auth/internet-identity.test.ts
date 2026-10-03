// Scenario 2: which Internet Identity the AuthClient is pointed at, and where
// the dev account is offered.
import { describe, expect, it } from "vitest"
import {
  internetIdentityOptions,
  LOCAL_II_AUTHORIZE,
  LOCAL_II_CANISTER,
} from "./internet-identity.ts"
import { isLocalPage } from "./local-page.ts"

const page = (origin: string) => ({
  origin,
  hostname: new URL(origin).hostname,
})

describe("the Internet Identity a page signs in with", () => {
  it("is the local one on a local page: the cookie's authorize URL and Internet Identity's backend", () => {
    const rootKey = new Uint8Array(133).fill(7)
    const options = internetIdentityOptions(page("http://localhost:5175"), {
      IC_ROOT_KEY: rootKey,
      INTERNET_IDENTITY_PROVIDER: "http://id.ai.localhost:8001/authorize",
    })
    expect(options).toEqual({
      identityProvider: {
        authorizeUrl: "http://id.ai.localhost:8001/authorize",
        canisterId: LOCAL_II_CANISTER,
      },
      // The mint calls go through the dev server's /api proxy, verified
      // against the local root key.
      agentOptions: { host: "http://localhost:5175", rootKey },
    })
  })

  it("falls back to icp-cli's default address, and asks the local replica for its key, without a cookie", () => {
    expect(
      internetIdentityOptions(page("http://127.0.0.1:5185"), undefined)
    ).toEqual({
      identityProvider: {
        authorizeUrl: LOCAL_II_AUTHORIZE,
        canisterId: LOCAL_II_CANISTER,
      },
      agentOptions: { host: "http://127.0.0.1:5185", shouldFetchRootKey: true },
    })
  })

  it("is mainnet's (AuthClient's defaults) on a deployed page, whatever a cookie says", () => {
    expect(
      internetIdentityOptions(page("https://wallet.example.com"), {
        INTERNET_IDENTITY_PROVIDER: "http://id.ai.localhost:8000/authorize",
      })
    ).toEqual({})
  })
})

describe("a local page", () => {
  it.each([
    "http://localhost:5175",
    "http://app.localhost:5175",
    "http://127.0.0.1:5185",
    "http://[::1]:5175",
  ])("%s is local", (origin) => {
    expect(isLocalPage(page(origin))).toBe(true)
  })

  it.each([
    "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io",
    "https://notlocalhost.com",
    "https://localhost.example.com",
    "https://wallet.example.com",
  ])("%s is not", (origin) => {
    expect(isLocalPage(page(origin))).toBe(false)
  })
})
