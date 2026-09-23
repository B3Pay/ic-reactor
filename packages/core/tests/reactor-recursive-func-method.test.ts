import { describe, it, expect, vi, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { ValidationError } from "../src/errors/index.js"

/**
 * A method typed by a recursive func alias, as didc emits for
 * `type f = func (f) -> (f); service : { a_callback : f; ... }`, is an
 * `IDL.Rec` wrapping the func. `getFuncClass` returned the wrapper, which has
 * no `argTypes`, `retTypes` or `annotations`, so `callMethod` failed with
 * "reading 'length'" and `isQueryMethod` threw. #557 fixed the display codecs
 * for the same type.
 */
const makeIdlFactory =
  (annotations: string[]): IDL.InterfaceFactory =>
  ({ IDL }) => {
    const callback = IDL.Rec()
    callback.fill(IDL.Func([callback], [callback], annotations))
    return IDL.Service({
      a_callback: callback as unknown as IDL.FuncClass,
      balance: IDL.Func([], [IDL.Nat], ["query"]),
    })
  }

/** The func type the method returns, for encoding its reply. */
function callbackType(annotations: string[]) {
  const callback = IDL.Rec()
  callback.fill(IDL.Func([callback], [callback], annotations))
  return callback
}

const reference: [Principal, string] = [
  Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
  "notify",
]

function createReactor(annotations: string[]) {
  return new Reactor<any>({
    clientManager: new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    }),
    name: "recursive",
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    idlFactory: makeIdlFactory(annotations),
  })
}

/** Answers every call with `reference`, encoded as the method's result. */
function answer(
  reactor: Reactor<any>,
  kind: "executeQuery" | "executeCall",
  annotations: string[]
) {
  const reply = IDL.encode([callbackType(annotations)], [reference])
  return vi.spyOn(reactor as any, kind).mockResolvedValue(new Uint8Array(reply))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Reactor with a method typed by a recursive func alias", () => {
  it("reads the method's annotations through the alias", () => {
    expect(createReactor(["query"]).isQueryMethod("a_callback")).toBe(true)
    expect(createReactor([]).isQueryMethod("a_callback")).toBe(false)
  })

  it("calls it as a query when it is annotated query", async () => {
    const reactor = createReactor(["query"])
    const query = answer(reactor, "executeQuery", ["query"])

    const result = await reactor.callMethod({
      functionName: "a_callback",
      args: [reference],
    })

    expect(query).toHaveBeenCalledOnce()
    const [returned, method] = result as [Principal, string]
    expect(returned.toText()).toBe(reference[0].toText())
    expect(method).toBe("notify")
  })

  it("calls it as an update otherwise, and through fetchQuery", async () => {
    const reactor = createReactor([])
    const call = answer(reactor, "executeCall", [])

    await reactor.callMethod({ functionName: "a_callback", args: [reference] })
    const cached = (await reactor.fetchQuery({
      functionName: "a_callback",
      args: [reference],
    })) as [Principal, string]

    expect(call).toHaveBeenCalledTimes(2)
    expect(cached[1]).toBe("notify")
  })
})

describe("DisplayReactor with a zero-argument method typed by a recursive func alias", () => {
  // `type next = func () -> (next)`: called without `args`, the method's
  // validator must see `[]`, as for any method that takes no arguments. It
  // was skipped because the alias looked like a method with arguments.
  const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
    const next = IDL.Rec()
    next.fill(IDL.Func([], [next], []))
    return IDL.Service({ a_next: next as unknown as IDL.FuncClass })
  }

  it("runs the method's validator when args are omitted", async () => {
    const reactor = new DisplayReactor<any>({
      clientManager: new ClientManager({
        queryClient: new QueryClient(),
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "recursive",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    const call = vi.spyOn(reactor as any, "executeCall")
    const validator = vi.fn(() => ({
      success: false as const,
      issues: [{ path: [], message: "not now" }],
    }))
    reactor.registerValidator("a_next", validator)

    await expect(
      reactor.callMethod({ functionName: "a_next" })
    ).rejects.toThrow(ValidationError)
    expect(validator).toHaveBeenCalledWith([])
    expect(call).not.toHaveBeenCalled()
  })
})
