import { describe, it, expect, afterEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { ClientManager } from "../src/client.js"

/**
 * `ClientManager` looks at the page it runs on to decide whether the agent can
 * route through the serving origin. It read `window.location.origin` and parsed
 * it with `new URL` unguarded, so construction threw wherever `window` exists
 * but its location is not a URL:
 *
 * - React Native defines `window` (as the global object) with no `location` at
 *   all. The installation guide lists React Native as a supported renderer.
 * - An opaque origin reads as the string "null": a file:// page in Firefox, an
 *   about:blank or srcdoc frame, a data: URL.
 *
 * Neither is a page an agent can be routed through, so both should simply keep
 * the configured or default host.
 */
describe("ClientManager on a page without a usable origin", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const construct = (host?: string) =>
    new ClientManager({
      queryClient: new QueryClient(),
      ...(host ? { agentOptions: { host } } : {}),
    })

  it("constructs where window has no location, as in React Native", () => {
    vi.stubGlobal("window", {})

    const manager = construct("https://icp-api.io")

    expect(manager.agentHost?.toString()).toBe("https://icp-api.io/")
    expect(manager.isLocal).toBe(false)
  })

  it("falls back to the default host there when none is configured", () => {
    vi.stubGlobal("window", {})

    expect(construct().agentHost?.toString()).toBe("https://ic0.app/")
  })

  it("constructs on a page whose origin is opaque", () => {
    vi.stubGlobal("window", {
      location: { origin: "null", protocol: "file:", hostname: "" },
    })

    const manager = construct()

    expect(manager.agentHost?.toString()).toBe("https://ic0.app/")
    expect(manager.trustsEnvConfig).toBe(false)
  })

  it("still routes through a local serving origin", () => {
    // Guard: the page-origin inference itself must keep working.
    vi.stubGlobal("window", {
      location: {
        origin: "http://backend.localhost:4943",
        protocol: "http:",
        hostname: "backend.localhost",
      },
    })

    const manager = construct()

    expect(manager.agentHost?.toString()).toBe("http://backend.localhost:4943/")
    expect(manager.isLocal).toBe(true)
  })
})
