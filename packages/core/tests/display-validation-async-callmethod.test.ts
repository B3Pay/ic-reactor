/**
 * `callMethod()` validates synchronously, so it refuses a method whose
 * validator is async. It learns that by calling the validator, which has then
 * already started, and the promise it returned was dropped: a validator that
 * rejects -- a blocklist lookup that fails, say -- raised an unhandled
 * rejection on top of the refusal. Node exits on one by default, and a browser
 * reports it to error tracking as an uncaught failure of its own.
 */
import { describe, it, expect, vi } from "vitest"
import { CallError, ClientManager, DisplayReactor } from "../src/index.js"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import type { ActorMethod } from "@icp-sdk/core/agent"

interface TestActor {
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  })

function setup() {
  const reactor = new DisplayReactor<TestActor>({
    name: "async-validator",
    idlFactory,
    canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    clientManager: new ClientManager({ queryClient: new QueryClient() }),
  })
  const executeQuery = vi
    .spyOn(reactor as any, "executeQuery")
    .mockResolvedValue(IDL.encode([IDL.Text], ["Hello, alice"]))
  return { reactor, executeQuery }
}

const ASYNC_REFUSAL = /Async validators are not supported in callMethod\(\)/

describe("callMethod() with an async validator", () => {
  it("refuses the call without leaving the validator's rejection unhandled", async () => {
    const { reactor, executeQuery } = setup()
    reactor.registerValidator("greet", async () => {
      throw new Error("blocklist service is down")
    })

    const unhandled: unknown[] = []
    const record = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on("unhandledRejection", record)
    try {
      await expect(
        reactor.callMethod({ functionName: "greet", args: ["alice"] })
      ).rejects.toThrow(ASYNC_REFUSAL)
      // Node reports an unhandled rejection once the microtask queue drains.
      await new Promise((resolve) => setTimeout(resolve, 20))
    } finally {
      process.off("unhandledRejection", record)
    }

    expect(unhandled).toEqual([])
    expect(executeQuery).not.toHaveBeenCalled()
  })

  it("still refuses a call whose async validator would accept it", async () => {
    const { reactor, executeQuery } = setup()
    reactor.registerValidator("greet", async () => ({ success: true }))

    const call = reactor.callMethod({ functionName: "greet", args: ["alice"] })
    await expect(call).rejects.toThrow(CallError)
    await expect(call).rejects.toThrow(ASYNC_REFUSAL)
    expect(executeQuery).not.toHaveBeenCalled()
  })
})
