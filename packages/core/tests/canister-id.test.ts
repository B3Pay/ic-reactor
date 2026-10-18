/**
 * `client.canisterId(target)`: what a target resolves to now, from the same
 * resolver a call uses, without a call. Its reasons are the resolver's own;
 * these tests check that the client hands them out as a call would meet them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createClient, type Client } from "../src/index.js"
import {
  COOKIE_CANISTER_ID,
  icEnvCookie,
  stubNoWindow,
  stubPage,
  stubProcessEnv,
} from "./network-helpers.js"
import * as shapes from "./fixtures/shapes.js"

const LOCAL_PAGE = "http://localhost:5173"
const CUSTOM_PAGE = "https://app.example.com"
const OTHER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai"

beforeEach(() => {
  stubProcessEnv()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const localClient = (): Client =>
  createClient({ network: "local", identity: "anonymous" })

/** The message a call on `{ name }` rejects with on `client`. */
const callRefusal = async (client: Client, name: string): Promise<unknown> =>
  client
    .canister<shapes.Actor>(shapes.actor, { name })
    .who()
    .catch((error: unknown) => error)

describe("a client's canisterId", () => {
  it("gives an { id } as it is, on any page and with no cookie", () => {
    stubPage(CUSTOM_PAGE, { cookie: "" })
    const client = createClient({ network: "ic", identity: "anonymous" })

    expect(client.canisterId({ id: OTHER_ID })).toStrictEqual({
      ok: true,
      id: OTHER_ID,
    })
    expect(client.canisterId({ id: OTHER_ID, certified: true })).toStrictEqual({
      ok: true,
      id: OTHER_ID,
    })
  })

  it("gives the cookie's id for a { name } on a trusted page, the id a call is sent to", () => {
    stubPage(LOCAL_PAGE)
    const client = localClient()
    const backend = client.canister<shapes.Actor>(shapes.actor, {
      name: "backend",
    })

    expect(client.canisterId({ name: "backend" })).toStrictEqual({
      ok: true,
      id: COOKIE_CANISTER_ID,
    })
    // The canister's keys carry the id its calls go to.
    expect(client.queryKey(backend)).toContain(COOKIE_CANISTER_ID)
  })

  it.each([
    [
      "absent",
      () => {
        stubPage(LOCAL_PAGE)
        return localClient()
      },
      "missing",
    ],
    [
      "untrusted_host",
      () => {
        stubPage(CUSTOM_PAGE)
        return createClient({ network: "ic", identity: "anonymous" })
      },
      "backend",
    ],
    [
      "no_browser",
      () => {
        stubNoWindow()
        return createClient({ network: "local", identity: "anonymous" })
      },
      "backend",
    ],
  ] as const)(
    "says %s, with the message a call on the same target rejects with",
    async (reason, setup, name) => {
      const send = vi.fn()
      vi.stubGlobal("fetch", send)
      const client = setup()

      const answer = client.canisterId({ name })
      expect(answer).toMatchObject({ ok: false, reason })
      const refusal = await callRefusal(client, name)
      expect(refusal).toMatchObject({ code: "canister_id_unresolved" })
      expect((refusal as Error).message).toContain(
        (answer as { message: string }).message
      )
      expect(send).not.toHaveBeenCalled()
    }
  )

  it("reads the cookie again on each call, so a new id is seen at once", () => {
    let cookie = icEnvCookie({ "PUBLIC_CANISTER_ID:backend": OTHER_ID })
    vi.stubGlobal("window", {
      location: { origin: LOCAL_PAGE, protocol: "http:" },
    })
    vi.stubGlobal("document", {
      get cookie() {
        return cookie
      },
    })
    const client = localClient()

    expect(client.canisterId({ name: "backend" })).toStrictEqual({
      ok: true,
      id: OTHER_ID,
    })
    cookie = icEnvCookie()
    expect(client.canisterId({ name: "backend" })).toStrictEqual({
      ok: true,
      id: COOKIE_CANISTER_ID,
    })
    cookie = ""
    expect(client.canisterId({ name: "backend" })).toMatchObject({
      ok: false,
      reason: "absent",
    })
  })

  it.each([
    ["an id that is not principal text", { id: "not-a-principal" }],
    ["both id and name", { id: OTHER_ID, name: "backend" }],
    ["neither", {}],
    ["an unknown option", { canisterId: OTHER_ID }],
    ["a value that is not an object", "backend"],
  ])("throws a TypeError for %s", (_label, target) => {
    const client = localClient()
    expect(() => client.canisterId(target as never)).toThrow(TypeError)
  })

  it("names itself in the TypeError for a target of the wrong shape", () => {
    const client = localClient()
    expect(() => client.canisterId({} as never)).toThrow(
      /client\.canisterId\(\) takes \{ id \} or \{ name \}/
    )
  })
})
