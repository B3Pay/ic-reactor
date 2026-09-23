import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { describe, expect, it, vi } from "vitest"
import { CandidDisplayReactor } from "../../src/display-reactor.js"

/**
 * A method typed by a recursive func alias (`type f = func (f) -> (f)`) is an
 * `IDL.Rec` wrapping the func, with no `argTypes` of its own. Building its
 * display codec threw out of `initialize()`, so a CandidDisplayReactor could
 * not be set up for the whole service (#557).
 */

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return {
    agent,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

const CANDID = `
type callback = func (callback) -> (callback);
service : {
  a_callback : callback;
  balance : () -> (nat) query;
}
`

describe("CandidDisplayReactor with a recursive func alias", () => {
  it("initializes, with a codec for every method", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const reactor = new CandidDisplayReactor({
      name: "recursive",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      candid: CANDID,
    })

    await expect(reactor.initialize()).resolves.toBeUndefined()

    const codecs = (reactor as any).codecs as Map<string, unknown>
    expect(codecs.has("a_callback")).toBe(true)
    expect(codecs.has("balance")).toBe(true)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
})
