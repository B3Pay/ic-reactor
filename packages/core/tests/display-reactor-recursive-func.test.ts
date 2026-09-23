import { describe, it, expect, vi, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"

/**
 * A method typed by a recursive func alias, as didc emits for
 * `type f = func (f) -> (f); service : { a_callback : f; ... }`, is an
 * `IDL.Rec` wrapping the func. It has no `argTypes` of its own, so building its
 * codec threw, and the one `try` around the loop in `initializeCodecs` then
 * left every method after it without a codec: their arguments and results
 * went through untransformed, as raw Candid (#557).
 */
const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const callback = IDL.Rec()
  callback.fill(IDL.Func([callback], [callback], []))
  return IDL.Service({
    // Service fields are ordered by name, so this one is visited first.
    a_callback: callback as unknown as IDL.FuncClass,
    balance: IDL.Func([], [IDL.Nat], ["query"]),
  })
}

function createReactor() {
  return new DisplayReactor({
    clientManager: new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    }),
    name: "recursive",
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DisplayReactor with a recursive func alias", () => {
  it("builds codecs for the methods after it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const reactor = createReactor()

    const codec = reactor.getCodec("balance" as never)
    expect(codec).not.toBeNull()
    expect(codec!.result.asDisplay(5n as never)).toBe("5")
  })

  it("builds a codec for the recursive method itself", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const reactor = createReactor()

    expect(reactor.getCodec("a_callback" as never)).not.toBeNull()
    expect(error).not.toHaveBeenCalled()
  })
})
