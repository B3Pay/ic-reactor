// @vitest-environment jsdom
//
// Scenario 2, in the browser: the real <Providers> (./providers.tsx) hydrates
// the home page's HTML. Its client is `createClient({ network: "ic", auth })`,
// the server prefetched as the anonymous caller on network "ic", and a
// visitor who is not signed in calls as the anonymous principal too: the same
// keys, so the cards render from the hydrated cache and the tab sends nothing
// on load. `globalThis.fetch`, which the client's agents would send with, is
// replaced by one that fails the test if anything is sent.
import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query"
import { act } from "@testing-library/react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LedgerSections } from "@/components/LedgerSections"
import { MyBalances } from "@/components/MyBalances"
import { SessionBadge } from "@/components/SessionBadge"
import { LEDGERS } from "@/ledgers"
import { prefetchLedgers } from "@/server/prefetch-ledgers"
import { ReactorProvider } from "@ic-reactor/react"
import { mockLedgers } from "@/testing/mock-ledgers"
import { Providers } from "./providers"

// jsdom has no IndexedDB, which the real AuthClient opens to restore a
// session, so a stand-in answers for a browser that holds none. It counts how
// often the provider's auth factory built one.
const built = vi.hoisted(() => ({ count: 0 }))
vi.mock("@icp-sdk/auth/client", () => ({
  AuthClient: class {
    constructor() {
      built.count += 1
    }
    getStatus() {
      return { state: "signed-out" } as const
    }
    getPrincipal() {
      return undefined
    }
    getIdentity() {
      return Promise.reject(new Error("signed out"))
    }
    subscribe() {
      return () => {}
    }
    signIn() {
      return Promise.reject(new Error("no Internet Identity in a test"))
    }
    signOut() {
      return Promise.resolve()
    }
    dispose() {}
  },
}))

let root: Root | undefined
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ""
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  built.count = 0
})

const Home = ({ state }: { state: DehydratedState }) => (
  <>
    <SessionBadge />
    <HydrationBoundary state={state}>
      <LedgerSections ledgers={LEDGERS} failures={{}} />
      <MyBalances ledgers={LEDGERS} />
    </HydrationBoundary>
  </>
)

describe("<Providers> hydrating the server's HTML", () => {
  it("renders from the server's cache and sends nothing on load", async () => {
    // The server: a request client prefetches; the server render of the
    // client components writes the HTML.
    const request = mockLedgers()
    const { state } = await prefetchLedgers(request.client, LEDGERS)
    const json = JSON.stringify(state)
    const ssr = mockLedgers()
    const html = renderToString(
      <ReactorProvider client={() => ssr.client}>
        <Home state={JSON.parse(json)} />
      </ReactorProvider>
    )

    // The browser.
    const network = vi.fn(() =>
      Promise.reject(new Error("the tab must not reach the network on load"))
    )
    vi.stubGlobal("fetch", network)
    const container = document.createElement("div")
    container.innerHTML = html
    document.body.appendChild(container)
    const recoverable: string[] = []
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    await act(async () => {
      root = hydrateRoot(
        container,
        <Providers>
          <Home state={JSON.parse(json)} />
        </Providers>,
        {
          onRecoverableError: (error) =>
            recoverable.push(String((error as Error).message)),
        }
      )
    })
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    expect(network).not.toHaveBeenCalled()
    // In the browser, the provider's client built its auth: once.
    expect(built.count).toBe(1)
    expect(
      [...container.querySelectorAll("[data-origin]")].map((origin) =>
        origin.getAttribute("data-origin")
      )
    ).toEqual(LEDGERS.map(() => "server"))

    request.client.dispose()
    ssr.client.dispose()
  })
})
