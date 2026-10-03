// Scenario 1: the request client is built inside the request, never at module
// scope. React's `cache()` memoizes `requestClient()` for one server request
// only; outside a request (here, in Node) every call builds a new client. A
// client held in the module's scope would be the same object on every call,
// and every visitor would share its cache.
import { afterEach, describe, expect, it } from "vitest"
import type { Client } from "@ic-reactor/core"
import { requestClient } from "./request-client"

const made: Client[] = []
afterEach(() => {
  for (const client of made.splice(0)) client.dispose()
})

describe("requestClient", () => {
  it("builds a new anonymous mainnet client for each request", () => {
    // Building a client sends nothing: it calls only when it is used.
    const first = requestClient()
    const second = requestClient()
    made.push(first, second)

    expect(second).not.toBe(first)
    expect(second.queryClient).not.toBe(first.queryClient)
    expect(first.network).toBe("ic")
    expect(first.authState()).toEqual({
      status: "anonymous",
      principal: "2vxsx-fae",
    })
  })
})
