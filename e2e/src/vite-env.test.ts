/**
 * `ic_env` resolution through the Vite plugin's dev server: a page served by
 * `vite dev` with @ic-reactor/vite-plugin gets the cookie that names
 * `hello_actor` and carries the replica's root key, and its calls reach the
 * replica through the server's `/api` proxy.
 */
import path from "node:path"
import { createClient } from "@ic-reactor/core"
import { icReactor } from "@ic-reactor/vite-plugin"
import { createServer, type ViteDevServer } from "vite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { actor, type Actor } from "./declarations/hello_actor"
import { replica } from "./replica"

/** The JSDOM instance vitest's jsdom environment exposes. */
const { jsdom } = globalThis as unknown as {
  jsdom: { reconfigure(options: { url: string }): void }
}

let server: ViteDevServer | undefined
let origin = ""

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    // e2e/, whose icp.yaml is the project the plugin asks `icp` about.
    root: path.resolve(import.meta.dirname, ".."),
    // Vitest's own mode is "test", in which the plugin injects nothing.
    mode: "development",
    logLevel: "silent",
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
    // Named only: the cookie carries its id; nothing is generated.
    plugins: [icReactor({ canisters: { hello_actor: {} } })],
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (address === null || typeof address !== "object") {
    throw new Error("the Vite dev server has no address")
  }
  origin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await server?.close()
})

describe("ic_env through the Vite plugin's dev server", () => {
  it("resolves { name } from the cookie a page load sets, and calls through /api", async () => {
    // Load the page the way a browser navigates to it.
    const page = await fetch(`${origin}/`, { headers: { accept: "text/html" } })
    const cookie = page.headers
      .getSetCookie()
      .find((line) => line.startsWith("ic_env="))
    expect(cookie, "the dev server set no ic_env cookie").toBeDefined()
    const value = decodeURIComponent(
      cookie!.split(";")[0].slice("ic_env=".length)
    )
    expect(value).toContain(
      `PUBLIC_CANISTER_ID:hello_actor=${replica.canisterId}`
    )
    expect(value).toContain(`ic_root_key=${replica.rootKey}`)

    // This test is that page now: its origin, and the cookie the server set.
    jsdom.reconfigure({ url: `${origin}/` })
    document.cookie = cookie!
    expect(window.location.origin).toBe(origin)

    // Every URL the client's agent requests.
    const requested: string[] = []
    const client = createClient({
      network: "env",
      identity: "anonymous",
      fetch: (input, init) => {
        requested.push(input instanceof Request ? input.url : String(input))
        return fetch(input, init)
      },
    })
    try {
      const hello = client.canister<Actor>(actor, { name: "hello_actor" })
      // The page's origin is the agent's host, so the call goes to the dev
      // server's /api, which forwards it to the replica.
      await expect(hello.greet("Vite")).resolves.toBe("Hello, Vite!")
      expect(
        requested.some(
          (url) =>
            url.startsWith(`${origin}/api/`) &&
            url.includes(`/canister/${replica.canisterId}/`)
        ),
        "the call did not go through the dev server's /api"
      ).toBe(true)
      // The root key is the cookie's: the client never asks for one. A client
      // that ignored the cookie's key would fetch it from /api/v2/status.
      expect(requested.filter((url) => url.endsWith("/api/v2/status"))).toEqual(
        []
      )
      expect(client.queryKey(hello, "greet", "Vite").slice(0, 4)).toEqual([
        "ic-reactor",
        origin,
        "2vxsx-fae",
        replica.canisterId,
      ])
    } finally {
      client.dispose()
    }
  })
})
