/**
 * The provider on a server, in a plain Node environment: no `window`, no
 * `localStorage`, no effects. A server renders each request as a tree of its
 * own, so the provider has to build a separate client for every request,
 * render the whole first pass anonymously without ever building the browser's
 * auth, and leave nothing behind: no `QueryClient` subscribed to the
 * process-wide focus and online managers, no client disposed.
 */
import { QueryClient, useQueryClient } from "@tanstack/react-query"
import { createTestAuth } from "@ic-reactor/core/testing"
import type { Client } from "@ic-reactor/core"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReactorProvider, useAuth, useClient } from "../src/index.js"
import { clientWithAuth, trackedFactory } from "./helpers.js"

const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")

afterEach(() => {
  vi.restoreAllMocks()
  if (storage === undefined) {
    Reflect.deleteProperty(globalThis, "localStorage")
  } else {
    Object.defineProperty(globalThis, "localStorage", storage)
  }
})

describe("ReactorProvider on a server", () => {
  it("renders in Node with no window or localStorage, anonymous, without building the auth", () => {
    // Reading storage on the server would throw in a real runtime that has
    // none; make it throw here too, so that touching it fails the render.
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("localStorage was read during a server render")
      },
    })
    expect(typeof window).toBe("undefined")
    const buildAuth = vi.fn(() => createTestAuth({ seed: 1 }))

    function Page() {
      const { status, principal } = useAuth()
      return <p>{`${status}:${principal}`}</p>
    }
    const html = renderToString(
      <ReactorProvider client={() => clientWithAuth(buildAuth)}>
        <Page />
      </ReactorProvider>
    )

    expect(html).toBe("<p>anonymous:2vxsx-fae</p>")
    expect(buildAuth).not.toHaveBeenCalled()
  })

  it("builds a separate client and QueryClient for each request and mounts nothing", () => {
    const mount = vi.spyOn(QueryClient.prototype, "mount")
    const buildAuth = vi.fn(() => createTestAuth({ seed: 1 }))
    const { factory, made } = trackedFactory(() => clientWithAuth(buildAuth))
    const seen: Array<{ client: Client; queryClient: QueryClient }> = []

    function Page() {
      seen.push({ client: useClient(), queryClient: useQueryClient() })
      return <p>{useAuth().status}</p>
    }
    const request = () =>
      renderToString(
        <ReactorProvider client={factory}>
          <Page />
        </ReactorProvider>
      )

    const first = request()
    const second = request()

    expect(first).toBe("<p>anonymous</p>")
    expect(second).toBe(first)
    expect(factory).toHaveBeenCalledTimes(2)
    expect(made[0]?.client).not.toBe(made[1]?.client)
    expect(made[0]?.client.queryClient).not.toBe(made[1]?.client.queryClient)
    // Each request's components read that request's own client and cache, and
    // the cache a component reaches through TanStack is the client's. Compared
    // by identity: two QueryClients that are alike are still two.
    expect(seen).toHaveLength(2)
    for (const [index, entry] of seen.entries()) {
      expect(entry.client).toBe(made[index]?.client)
      expect(entry.queryClient).toBe(made[index]?.client.queryClient)
    }
    expect(mount).not.toHaveBeenCalled()
    expect(made.map((entry) => entry.dispose.mock.calls.length)).toEqual([0, 0])
    expect(buildAuth).not.toHaveBeenCalled()
  })

  it("builds a separate client for each request that renders the same element", () => {
    // A browser keeps the client its uncommitted render built, for the render
    // React retries after a suspend. A server commits nothing, so a client it
    // kept for an element built once at module scope would reach every later
    // request, and with it that request's cache and caller.
    const { factory, made } = trackedFactory(() =>
      clientWithAuth(() => createTestAuth({ seed: 1 }))
    )
    const seen: Client[] = []
    function Page() {
      seen.push(useClient())
      return null
    }
    const element = (
      <ReactorProvider client={factory}>
        <Page />
      </ReactorProvider>
    )

    renderToString(element)
    renderToString(element)

    expect(factory).toHaveBeenCalledTimes(2)
    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
    expect(made).toHaveLength(2)
  })

  it("names the provider when a component reads the client outside one", () => {
    function Orphan() {
      useClient()
      return null
    }
    expect(() => renderToString(<Orphan />)).toThrow(/ReactorProvider/)
  })
})
