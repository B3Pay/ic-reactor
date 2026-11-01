/**
 * Copies of the `ic_env` cookie on one page.
 *
 * A browser keeps one cookie of a name for each path or domain it was set
 * for, and lists all of them to a page that receives them; `@icp-sdk/core`
 * reads the first it lists. The asset canister sets `ic_env` with no path, so
 * a page can receive more than one, and when they differ nothing on the page
 * tells which is the one the frontend's canister set. So off a local page a
 * trusted cookie whose copies differ is believed for nothing: a `{ name }`
 * target is refused as `untrusted_host`, as a cookie the page does not trust
 * is, and neither the cookie's root key nor its sign-in entries are taken.
 * Copies that are the same are believed. A local page reads the first, as it
 * always has: a redeploy there often leaves an older copy at another path,
 * and only the machine itself can set one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createClient, type Client } from "../src/client.js"
import {
  authNetworkFor,
  resolveCanisterId,
  resolveNetwork,
  type Network,
  type NetworkOptions,
} from "../src/network.js"
import {
  COOKIE_CANISTER_ID,
  COOKIE_ROOT_KEY,
  REPLICA_ROOT_KEY,
  icEnvCookie,
  sameBytes,
  stubPage,
  stubProcessEnv,
} from "./network-helpers.js"

const ICP0_PAGE = "https://bkyz2-fmaaa-aaaaa-qaaaq-cai.icp0.io"
const RAW_PAGE = "https://bkyz2-fmaaa-aaaaa-qaaaq-cai.raw.icp0.io"
const LOCAL_PAGE = "http://localhost:5173"
const CUSTOM_PAGE = "https://app.example.com"

/** A canister id other than the one the frontend's cookie names. */
const OTHER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai"

/** The frontend's cookie, and a copy that names another id for `backend`. */
const ours = icEnvCookie()
const other = icEnvCookie({ "PUBLIC_CANISTER_ID:backend": OTHER_ID })

/** Cookies as the browser lists them to the page: `a=1; b=2`. */
const listed = (...cookies: string[]) => cookies.join("; ")

const made: Client[] = []

beforeEach(() => {
  stubProcessEnv()
})

afterEach(() => {
  for (const client of made.splice(0)) client.dispose()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** Resolves `{ name: "backend" }` on `network`, on a page at `page` that receives `cookie`. */
const backend = (
  network: Network,
  page: string,
  cookie: string,
  options?: NetworkOptions
) => {
  stubPage(page, { cookie })
  return resolveCanisterId(
    { name: "backend" },
    resolveNetwork(network, options)
  )
}

/** The identity provider the client hands its `auth` factory on that page. */
const provider = (
  network: Network,
  page: string,
  cookie: string,
  options?: NetworkOptions
) => {
  stubPage(page, { cookie })
  return authNetworkFor(network, resolveNetwork(network, options)).network
    .identityProvider
}

describe("copies of the ic_env cookie that are the same", () => {
  it("are believed on a canister's icp0.io page", () => {
    for (const page of [ICP0_PAGE, RAW_PAGE]) {
      expect(backend("env", page, listed(ours, ours))).toStrictEqual({
        ok: true,
        id: COOKIE_CANISTER_ID,
      })
    }
  })
})

describe("copies of the ic_env cookie that differ, off a local page", () => {
  it.each([
    ["the frontend's listed first", listed(ours, other)],
    ["the frontend's listed last", listed(other, ours)],
  ])(
    'name no canister on a canister\'s icp0.io page, for "env" and "ic": %s',
    (_, cookie) => {
      for (const page of [ICP0_PAGE, RAW_PAGE]) {
        for (const network of ["env", "ic"] as Network[]) {
          const result = backend(network, page, cookie)

          expect(result).toMatchObject({ ok: false, reason: "untrusted_host" })
          expect(result.ok || result.message).toContain(
            "the page's ic_env cookies differ"
          )
        }
      }
    }
  )

  it("are refused as one call reads them, under client.canisterId", () => {
    stubPage(ICP0_PAGE, { cookie: listed(other, ours) })
    const client = createClient({ network: "env", identity: "anonymous" })
    made.push(client)

    expect(client.canisterId({ name: "backend" })).toMatchObject({
      ok: false,
      reason: "untrusted_host",
    })
  })

  it("name no canister, sign-in or root key with allowEnvConfig: true", () => {
    const signIn = (url: string) =>
      icEnvCookie({ INTERNET_IDENTITY_PROVIDER: url })
    const options = { allowEnvConfig: true }

    expect(
      backend("env", CUSTOM_PAGE, listed(ours, other), options)
    ).toMatchObject({ ok: false, reason: "untrusted_host" })
    expect(
      provider(
        "env",
        CUSTOM_PAGE,
        listed(
          signIn("https://id.example.com/authorize"),
          signIn("https://id.example.org/authorize")
        ),
        options
      )
    ).toBeUndefined()

    // A page that is not local, opted in, whose fallback is a local replica,
    // takes the cookie's root key from one copy, and from copies that
    // differ none: the agent then asks the replica.
    stubProcessEnv({ ICP_NETWORK: "local" })
    stubPage(CUSTOM_PAGE, {
      cookie: listed(
        icEnvCookie(undefined, COOKIE_ROOT_KEY),
        icEnvCookie(undefined, REPLICA_ROOT_KEY)
      ),
    })
    const net = resolveNetwork("env", options)
    expect(net.rootKey).toBeUndefined()
    expect(net.fetchRootKey).toBe(true)

    stubPage(CUSTOM_PAGE, { cookie: icEnvCookie(undefined, COOKIE_ROOT_KEY) })
    expect(
      sameBytes(resolveNetwork("env", options).rootKey, COOKIE_ROOT_KEY)
    ).toBe(true)
  })
})

describe("copies of the ic_env cookie that differ, on a local page", () => {
  it("leave the first believed, as before", () => {
    expect(backend("env", LOCAL_PAGE, listed(ours, other))).toStrictEqual({
      ok: true,
      id: COOKIE_CANISTER_ID,
    })
    expect(backend("env", LOCAL_PAGE, listed(other, ours))).toStrictEqual({
      ok: true,
      id: OTHER_ID,
    })
  })
})
