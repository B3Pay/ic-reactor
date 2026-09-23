import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"
import { FieldVisitor } from "../../src/visitor/arguments/index.js"
import { CandidFormVisitor } from "../../src/visitor/candid/index.js"
import { ResultFieldVisitor } from "../../src/visitor/returns/index.js"

/**
 * registerMethod rebuilt the metadata of every method in the service to add
 * one, and did so even when the method was already registered, which is every
 * call to callDynamic, queryDynamic, fetchQueryDynamic and
 * callDynamicWithMeta. Registering 600 methods one at a time took 11.7 s on
 * MetadataDisplayReactor and 9.3 s on MetadataReactor, against 74 ms and 47 ms
 * on the reactors they extend, and a repeat registration on a 300-method
 * service cost about 19 ms. Each rebuild also replaced the metadata objects
 * of methods that had not changed.
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

const METHOD_COUNT = 50
const SIGNATURE =
  "(record { owner : principal; amount : nat; memo : opt blob }) -> (variant { Ok : nat; Err : text })"

function largeService(): string {
  const methods = Array.from(
    { length: METHOD_COUNT },
    (_, i) => `m${i} : ${SIGNATURE};`
  )
  return `service : {\n${methods.join("\n")}\n}`
}

const reactors = [
  ["MetadataDisplayReactor", MetadataDisplayReactor, FieldVisitor],
  ["MetadataReactor", MetadataReactor, CandidFormVisitor],
] as const

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(reactors)(
  "%s.registerMethod metadata",
  (_name, Reactor, ArgumentVisitor) => {
    async function initialized() {
      const reactor = new Reactor({
        name: "large",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: largeService(),
      })
      await reactor.initialize()
      return reactor
    }

    it("describes only the method it adds", async () => {
      const reactor = await initialized()
      const describeArgs = vi.spyOn(ArgumentVisitor.prototype, "visitFunc")
      const describeResult = vi.spyOn(
        ResultFieldVisitor.prototype,
        "visitFuncAsMethod"
      )

      await reactor.registerMethod({ functionName: "extra", candid: SIGNATURE })

      expect(describeArgs).toHaveBeenCalledTimes(1)
      expect(describeResult).toHaveBeenCalledTimes(1)
      expect(reactor.getInputMeta("extra")?.argCount).toBe(1)
      expect(reactor.getOutputMeta("extra")?.returnCount).toBe(1)
      expect(Object.keys(reactor.getAllInputMeta() ?? {})).toHaveLength(
        METHOD_COUNT + 1
      )
      expect(Object.keys(reactor.getAllOutputMeta() ?? {})).toHaveLength(
        METHOD_COUNT + 1
      )
    })

    it("describes each method registerMethods adds once", async () => {
      const reactor = await initialized()
      const describeArgs = vi.spyOn(ArgumentVisitor.prototype, "visitFunc")

      await reactor.registerMethods([
        { functionName: "a", candid: "() -> (nat) query" },
        { functionName: "b", candid: "(text) -> (bool)" },
        { functionName: "c", candid: "(nat, nat) -> (nat) query" },
      ])

      expect(describeArgs).toHaveBeenCalledTimes(3)
      expect(reactor.getInputMeta("c")?.argCount).toBe(2)
    })

    it("keeps the metadata of the methods it does not touch", async () => {
      const reactor = await initialized()
      const input = reactor.getInputMeta("m0")
      const output = reactor.getOutputMeta("m0")

      await reactor.registerMethod({ functionName: "extra", candid: SIGNATURE })

      expect(reactor.getInputMeta("m0")).toBe(input)
      expect(reactor.getOutputMeta("m0")).toBe(output)
    })

    it("changes nothing for a method that is already registered", async () => {
      const reactor = await initialized()
      const allInput = reactor.getAllInputMeta()
      const allOutput = reactor.getAllOutputMeta()
      const describeArgs = vi.spyOn(ArgumentVisitor.prototype, "visitFunc")

      await reactor.registerMethod({ functionName: "m7", candid: SIGNATURE })

      expect(describeArgs).not.toHaveBeenCalled()
      expect(reactor.getAllInputMeta()).toBe(allInput)
      expect(reactor.getAllOutputMeta()).toBe(allOutput)
    })

    it("describes a method registered before initialize()", async () => {
      const reactor = new Reactor({
        name: "large",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: largeService(),
      })

      await reactor.registerMethod({ functionName: "early", candid: SIGNATURE })

      expect(reactor.getInputMeta("early")?.argCount).toBe(1)
      expect(reactor.getOutputMeta("early")?.returnCount).toBe(1)
    })
  }
)
