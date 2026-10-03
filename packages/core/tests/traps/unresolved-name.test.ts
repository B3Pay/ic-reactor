/**
 * Trap: a canister id taken from a cookie the page cannot trust.
 *
 * The mistake a hand-written integration makes: it reads `ic_env`, the cookie
 * that tells a front end where its canisters are, wherever its code runs, and
 * calls the id it finds under the canister's name. A cookie is not isolated
 * to an origin: any sibling subdomain of the page's domain can write one. The
 * id such a cookie names is a real canister, whose replies verify against the
 * real root key, so no certificate check ever notices the substitution, and
 * the user's transfer goes to the ledger the attacker chose. On a server there
 * is no cookie at all, and a hand-written reader finds none and sends the call
 * to an `undefined` id or to a default.
 *
 * The guarantee: a canister named `{ name }` resolves only on a page where the
 * cookie is as trustworthy as the replica: the page and the replica are both
 * local, or the app wrote `allowEnvConfig: true`. Anywhere else (a server, an
 * ordinary web host) every call to it rejects `invalid_args` with the code
 * `canister_id_unresolved` and `mayHaveExecuted: false`, sends nothing, and
 * the read's key carries `$unresolved:<name>`, so no data is cached for a
 * guess. The control cases show the same calls resolve, and are sent, where
 * the cookie is trusted.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import * as icrc1 from "../fixtures/icrc1.js"
import {
  ALICE,
  LEDGER,
  SIGNED_CALLS_TIMEOUT_MS,
  disposeAll,
  rejection,
  setupLedger,
  transferArg,
  type TestClientOptions,
} from "./ledger.js"

vi.setConfig({ testTimeout: SIGNED_CALLS_TIMEOUT_MS })
afterAll(disposeAll)
afterEach(() => vi.unstubAllGlobals())

/**
 * The `ic_env` cookie a sibling subdomain, or an asset canister, writes: the id
 * `LEDGER` under the name `ledger`, and a root key (which the client never
 * takes from a cookie, so any key of the right length stands for one).
 */
const COOKIE = `ic_env=${encodeURIComponent(
  `ic_root_key=${"07".repeat(133)}&PUBLIC_CANISTER_ID:ledger=${LEDGER}`
)}`

/** Runs the code on a browser page at `origin` whose cookie jar holds {@link COOKIE}. */
function onPage(origin: string): void {
  vi.stubGlobal("window", {
    location: { origin, protocol: new URL(origin).protocol },
  })
  vi.stubGlobal("document", { cookie: COOKIE })
}

/**
 * A client whose ledger lives at `LEDGER` but whose app only knows it as
 * `{ name: "ledger" }`, and what it calls: a read and an update.
 */
function namedLedger(options?: TestClientOptions) {
  const l = setupLedger(options)
  const named = l.client.canister<icrc1.Actor>(icrc1.actor, { name: "ledger" })
  return { ...l, named }
}

const unresolved = {
  kind: "invalid_args",
  code: "canister_id_unresolved",
  mayHaveExecuted: false,
}

describe("a canister named { name } where the cookie is not trusted", () => {
  it("is unresolved on a server, which has no cookie: every call is refused and nothing is sent", async () => {
    // Node: no window, and so no cookie jar.
    const { named, sent } = namedLedger()

    await expect(
      rejection(named.icrc1_balance_of({ owner: ALICE, subaccount: null }))
    ).resolves.toMatchObject(unresolved)
    await expect(
      rejection(named.icrc1_transfer(transferArg(500n)))
    ).resolves.toMatchObject(unresolved)
    expect(sent()).toEqual([])
  })

  it("is unresolved on an ordinary web page whose cookie names a real ledger, though the replica is local", async () => {
    // The page is `app.example.com`; a sibling subdomain wrote the cookie. The
    // replica the client talks to is a local one, which would be trusted on a
    // local page, so the page alone decides.
    onPage("https://app.example.com")
    const { named, sent, executed } = namedLedger()

    await expect(
      rejection(named.icrc1_balance_of({ owner: ALICE, subaccount: null }))
    ).resolves.toMatchObject(unresolved)
    await expect(
      rejection(named.icrc1_transfer(transferArg(500n)))
    ).resolves.toMatchObject(unresolved)
    expect(sent()).toEqual([])
    expect(executed()).toBe(0)
  })

  it("is unresolved for a read through queryOptions, under a key that names the guess it did not make", async () => {
    onPage("https://app.example.com")
    const { client, named, sent } = namedLedger()

    const options = client.queryOptions(named, "icrc1_balance_of", {
      owner: ALICE,
      subaccount: null,
    })

    expect(options.queryKey).toContain("$unresolved:ledger")
    await expect(
      client.queryClient.fetchQuery({ ...options, retry: false })
    ).rejects.toMatchObject(unresolved)
    expect(sent()).toEqual([])
  })
})

describe("a canister named { name } where the cookie is trusted", () => {
  it("is resolved on a local page with a local replica, and sent to the id the cookie names", async () => {
    onPage("http://localhost:5173")
    const { named, sent } = namedLedger()

    await expect(
      named.icrc1_balance_of({ owner: ALICE, subaccount: null })
    ).resolves.toBe(1_000_000n)

    expect(sent()).toMatchObject([{ endpoint: "query", canisterId: LEDGER }])
  })

  it("is resolved on an ordinary page when the app writes allowEnvConfig: true", async () => {
    onPage("https://app.example.com")
    const { named, sent } = namedLedger({ allowEnvConfig: true })

    await expect(
      named.icrc1_balance_of({ owner: ALICE, subaccount: null })
    ).resolves.toBe(1_000_000n)

    expect(sent()).toMatchObject([{ endpoint: "query", canisterId: LEDGER }])
  })
})

it("never lets the cookie override a canister the app named by its id", async () => {
  // The id is configuration, and it wins over whatever the page says.
  onPage("http://localhost:5173")
  const l = setupLedger()

  await expect(
    l.ledger.icrc1_balance_of({ owner: ALICE, subaccount: null })
  ).resolves.toBe(1_000_000n)

  expect(l.sent()).toMatchObject([{ canisterId: LEDGER }])
})
