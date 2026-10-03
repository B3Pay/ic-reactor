// Scenario 2, the server render: the real <Providers> (./providers.tsx), as
// Next renders it on the server for every request. Its client calls as the
// anonymous principal, never builds its auth, and reaches nothing.
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SessionBadge } from "@/components/SessionBadge"
import { Providers } from "./providers"

// Stands in for `@icp-sdk/auth/client` only to count how often an
// `AuthClient` is built; on a server, it must not be.
const built = vi.hoisted(() => ({ count: 0 }))
// The real `createClient`, watched: what it is asked for, and how often.
const created = vi.hoisted(() => ({ options: [] as unknown[] }))
vi.mock("@ic-reactor/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@ic-reactor/core")>()
  return {
    ...core,
    createClient: (options: Parameters<typeof core.createClient>[0]) => {
      created.options.push(options)
      return core.createClient(options)
    },
  }
})
vi.mock("@icp-sdk/auth/client", () => ({
  AuthClient: class {
    constructor() {
      built.count += 1
    }
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  built.count = 0
  created.options = []
})

describe("<Providers> in the server render", () => {
  it("is anonymous, builds no AuthClient and reaches nothing", () => {
    const network = vi.fn(() =>
      Promise.reject(new Error("a server render must not reach the network"))
    )
    vi.stubGlobal("fetch", network)

    const html = renderToString(
      <Providers>
        <SessionBadge />
      </Providers>
    )

    expect(html).toBe(
      '<span class="pill" data-status="anonymous" title="2vxsx-fae">anonymous</span>'
    )
    expect(built.count).toBe(0)
    expect(network).not.toHaveBeenCalled()
  })

  it("builds a client of its own per render: per request, on a server", () => {
    for (let request = 0; request < 2; request += 1) {
      renderToString(
        <Providers>
          <SessionBadge />
        </Providers>
      )
    }

    expect(created.options).toEqual([
      { network: "ic", auth: expect.any(Function) },
      { network: "ic", auth: expect.any(Function) },
    ])
    expect(built.count).toBe(0)
  })
})
