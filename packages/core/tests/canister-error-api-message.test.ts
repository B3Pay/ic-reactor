import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { CanisterError } from "../src/errors/index.js"

/**
 * Orbit's station, and any canister using its error shape, answers
 *
 *   Err : record { code : text; message : opt text; details : opt vec record { text; text } }
 *
 * which is the API shape CanisterError reads its `code` and `message` from.
 * It took `message` only when that was text. A `DisplayReactor` unwraps the
 * `opt text` to text, but a `Reactor` decodes it as `[] | [string]`, so the
 * same canister error gave "Account not found" through one and the whole
 * payload pretty-printed as JSON through the other (#690). A raw `opt text`
 * holding text now gives that text too.
 */

const OrbitError = IDL.Record({
  code: IDL.Text,
  message: IDL.Opt(IDL.Text),
  details: IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))),
})
const GetAccountResult = IDL.Variant({ Ok: IDL.Text, Err: OrbitError })

interface OrbitErrorView {
  code: string
  message: [] | [string]
  details: [] | [Array<[string, string]>]
}

interface Service {
  get_account: ActorMethod<[string], { Ok: string } | { Err: OrbitErrorView }>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_account: IDL.Func([IDL.Text], [GetAccountResult], ["query"]),
  })

const notFound: OrbitErrorView = {
  code: "NOT_FOUND",
  message: ["Account not found"],
  details: [[["account_id", "abc"]]],
}

describe("the message of an API-shaped canister error", () => {
  let reply: Uint8Array
  let clientManager: ClientManager

  beforeEach(() => {
    clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
    vi.spyOn(clientManager.agent, "query").mockImplementation((async () => ({
      status: QueryResponseStatus.Replied,
      reply: { arg: reply },
    })) as never)
  })

  const reactors = () => ({
    Reactor: new Reactor<Service>({
      clientManager,
      name: "station",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    }),
    DisplayReactor: new DisplayReactor<Service>({
      clientManager,
      name: "station-display",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    }),
  })

  async function canisterErrorOf(
    reactor: Reactor<Service> | DisplayReactor<Service>
  ): Promise<CanisterError> {
    try {
      await reactor.callMethod({ functionName: "get_account", args: ["abc"] })
    } catch (error) {
      if (error instanceof CanisterError) return error
      throw error
    }
    throw new Error("the call did not reject")
  }

  it("is the opt text's content through a Reactor, as through a DisplayReactor", async () => {
    reply = IDL.encode([GetAccountResult], [{ Err: notFound }])
    const { Reactor: raw, DisplayReactor: display } = reactors()

    const rawError = await canisterErrorOf(raw)
    const displayError = await canisterErrorOf(display)

    expect(rawError.message).toBe("Account not found")
    expect(displayError.message).toBe("Account not found")
    expect(rawError.code).toBe("NOT_FOUND")
    // The payload itself is untouched.
    expect(rawError.err).toEqual(notFound)
  })

  it("falls back to the payload's JSON for an empty opt text, in both reactors", async () => {
    // Guard: with no text to use, the message is the payload, as before, and
    // an API-shaped payload gets no "Canister Error:" prefix.
    reply = IDL.encode(
      [GetAccountResult],
      [{ Err: { code: "UNAUTHORIZED", message: [], details: [] } }]
    )
    const { Reactor: raw, DisplayReactor: display } = reactors()

    const rawError = await canisterErrorOf(raw)
    const displayError = await canisterErrorOf(display)

    expect(rawError.message).toBe(
      JSON.stringify(
        { code: "UNAUTHORIZED", message: [], details: [] },
        null,
        2
      )
    )
    expect(displayError.message).toBe(JSON.stringify(displayError.err, null, 2))
    expect(displayError.message).toContain('"code": "UNAUTHORIZED"')
  })
})

describe("new CanisterError() with an API-shaped value", () => {
  it("takes the text in a one-element opt as the message", () => {
    const error = new CanisterError({
      code: "NOT_FOUND",
      message: ["Account not found"],
      details: [],
    })

    expect(error.message).toBe("Account not found")
  })

  it("takes a text message as it always has", () => {
    // Guard.
    const error = new CanisterError({
      code: "RateLimited",
      message: "Too many requests",
      details: null,
    })

    expect(error.message).toBe("Too many requests")
  })

  it.each([
    ["an opt of a non-text value", [42]],
    ["more than one element", ["a", "b"]],
    ["null", null],
  ])("falls back to the payload's JSON for %s", (_, message) => {
    // Guard: only text, or one text in an array, is a message.
    const value = { code: "ODD", message, details: [] }

    expect(new CanisterError(value).message).toBe(
      JSON.stringify(value, null, 2)
    )
  })

  it("gives CanisterError.create() the same message", () => {
    const error = CanisterError.create({
      code: "NOT_FOUND",
      message: ["Account not found"],
      details: [],
    })

    expect(error.message).toBe("Account not found")
    expect(error.code).toBe("NOT_FOUND")
  })
})
