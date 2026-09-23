import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { describe, expect, it } from "vitest"
import { CandidReactor } from "../../src/reactor.js"
import { normalizeCandidInterface } from "../../src/utils.js"

/**
 * A Candid method name may be any text, quoted. registerMethod builds a
 * service around the signature and pasted the name into it unescaped, so a
 * name holding a quote, a backslash or a control character made a service that
 * did not parse, or that named another method.
 */

function createReactor() {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return new CandidReactor({
    name: "dynamic",
    canisterId: "aaaaa-aa",
    clientManager: {
      agent,
      registerCanisterId: () => {},
      subscribe: () => () => {},
      queryClient: {
        invalidateQueries: () => Promise.resolve(),
        ensureQueryData: () => Promise.resolve(undefined),
        getQueryData: () => undefined,
      },
    } as unknown as ClientManager,
  })
}

describe("registerMethod with a name that needs escaping", () => {
  it.each(['say "hi"', "a\\b", "ends\\", "line\nbreak", "tab\there"])(
    "registers %j under exactly that name",
    async (name) => {
      const reactor = createReactor()

      await reactor.registerMethod({
        functionName: name,
        candid: "(text) -> (text) query",
      })

      expect(reactor.getMethodNames()).toEqual([name])
    }
  )

  it("quotes the name in the service it builds", () => {
    expect(normalizeCandidInterface("() -> ()", 'say "hi"\n')).toBe(
      'service : { "say \\"hi\\"\\u{a}": () -> (); }'
    )
  })

  it("leaves a plain name as it was", () => {
    expect(normalizeCandidInterface("() -> ()", "greet")).toBe(
      'service : { "greet": () -> (); }'
    )
  })
})
