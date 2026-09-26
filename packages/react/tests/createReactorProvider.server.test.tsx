// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import { QueryClient, useQueryClient } from "@tanstack/react-query"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { createReactorProvider } from "../src/createReactorProvider.js"
import { defineReactor } from "../src/defineReactor.js"
import { AuthenticationManager } from "../src/auth/index.js"

/**
 * A server renders each request as a tree of its own, and runs no effects. The
 * provider has to build a separate value for every request, render its whole
 * first pass without an effect, and leave nothing behind: no QueryClient
 * subscribed to the process-wide focus and online managers, no manager
 * disposed or restored.
 */

interface TodoActor {
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("createReactorProvider on a server", () => {
  it("builds a separate value for each request and renders it without effects", () => {
    const mount = vi.spyOn(QueryClient.prototype, "mount")
    const dispose = vi.spyOn(AuthenticationManager.prototype, "dispose")
    const factory = vi.fn(() =>
      defineReactor<TodoActor>({
        name: "todo",
        idlFactory,
        canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
        agentOptions: { host: "https://icp-api.io" },
      })
    )
    const { ReactorProvider, useReactor } = createReactorProvider(factory)
    const clients: QueryClient[] = []

    function Page() {
      const { useAuth, useActorQuery } = useReactor()
      clients.push(useQueryClient())
      const { isAuthenticating } = useAuth()
      const { data } = useActorQuery({
        functionName: "greet",
        args: ["alice"],
      })
      return (
        <p>
          {isAuthenticating ? "checking" : "checked"}, {data ?? "loading"}
        </p>
      )
    }
    const request = () =>
      renderToString(
        <ReactorProvider>
          <Page />
        </ReactorProvider>
      )

    const first = request()
    const second = request()

    expect(first).toBe("<p>checking<!-- -->, <!-- -->loading</p>")
    expect(second).toBe(first)
    expect(factory).toHaveBeenCalledTimes(2)
    const [one, two] = factory.mock.results.map((result) => result.value)
    expect(one).not.toBe(two)
    // Each request's components read that request's own cache.
    expect(clients).toEqual([one.queryClient, two.queryClient])
    expect(mount).not.toHaveBeenCalled()
    expect(dispose).not.toHaveBeenCalled()
  })

  it("builds a separate value for each request that renders the same element", () => {
    // A browser reuses a value its uncommitted render built, for the render
    // React retries after a suspend. A server commits nothing, so a value it
    // kept for a module-scope element would reach every later request.
    const factory = vi.fn(() => ({
      queryClient: new QueryClient(),
    }))
    const { ReactorProvider, useReactor } = createReactorProvider(factory)
    const seen: unknown[] = []
    function Page() {
      seen.push(useReactor())
      return null
    }
    const element = (
      <ReactorProvider>
        <Page />
      </ReactorProvider>
    )

    renderToString(element)
    renderToString(element)

    expect(factory).toHaveBeenCalledTimes(2)
    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
  })
})
