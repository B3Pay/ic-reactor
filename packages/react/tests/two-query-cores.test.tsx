/**
 * Two copies of `@tanstack/query-core`, one for core and one for
 * `@tanstack/react-query` (#873).
 *
 * npm installs a second copy when the app's `@tanstack/query-core` is not the
 * exact version its `@tanstack/react-query` depends on. Core then builds its
 * `QueryClient` from one copy and the hooks read the other, and each copy has
 * its own `skipToken`, so a read meant to wait runs and rejects
 * `invalid_args`. Nothing failed loudly: the provider now does, in
 * development.
 *
 * The second copy here is what npm makes: core's built package and
 * `@tanstack/query-core` copied under another `node_modules`, so that the
 * copied core imports the copied query-core, while `@tanstack/react-query`
 * keeps the workspace's own.
 */
import type { Client } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { ReactorProvider, useClient } from "../src/index.js"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const require = createRequire(import.meta.url)

/** The directory of `@ic-reactor/core` as the workspace links it. */
const coreDir = (): string =>
  dirname(realpathSync(require.resolve("@ic-reactor/core/package.json")))

/** The directory of a package core depends on, as pnpm links it for core. */
const besideCore = (core: string, name: string): string =>
  realpathSync(join(core, "node_modules", name))

let root: string
let foreignCore: typeof import("@ic-reactor/core")

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "ic-reactor-two-query-cores-"))
  const modules = join(root, "node_modules")
  const core = coreDir()
  // The copies: core's built package, and its query-core.
  cpSync(
    join(core, "package.json"),
    join(modules, "@ic-reactor/core/package.json")
  )
  cpSync(join(core, "dist"), join(modules, "@ic-reactor/core/dist"), {
    recursive: true,
  })
  cpSync(
    besideCore(core, "@tanstack/query-core"),
    join(modules, "@tanstack/query-core"),
    { recursive: true, dereference: true }
  )
  // Core's other peers, shared with the workspace.
  for (const name of [
    "@candid-core/schema",
    "@icp-sdk/core",
    "@noble/curves",
  ]) {
    mkdirSync(dirname(join(modules, name)), { recursive: true })
    symlinkSync(besideCore(core, name), join(modules, name), "dir")
  }
  foreignCore = (await import(
    pathToFileURL(join(modules, "@ic-reactor/core/dist/index.js")).href
  )) as typeof import("@ic-reactor/core")
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** A client of the copied core: its QueryClient comes from the copied query-core. */
const foreignClient = (): Client =>
  foreignCore.createClient({ network: "ic", identity: "anonymous" })

function Probe() {
  return <p data-testid="probe">{useClient() ? "ok" : "none"}</p>
}

describe("a client whose @tanstack/query-core is not @tanstack/react-query's", () => {
  it("is another module instance than the hooks' (the fixture holds)", () => {
    const client = foreignClient()
    expect(client.queryClient instanceof QueryClient).toBe(false)
    expect(require.resolve("@tanstack/react-query")).not.toContain(root)
    client.dispose()
  })

  it("makes the provider throw in development, naming the fix", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const client = foreignClient()
    expect(() =>
      render(
        <ReactorProvider client={() => client}>
          <Probe />
        </ReactorProvider>
      )
    ).toThrow(
      /two copies of @tanstack\/query-core are installed.*`npm ls @tanstack\/query-core` must show one copy/
    )
    client.dispose()
  })

  it("does not make it throw in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    const client = foreignClient()
    const { getByTestId, unmount } = render(
      <ReactorProvider client={() => client}>
        <Probe />
      </ReactorProvider>
    )
    expect(getByTestId("probe").textContent).toBe("ok")
    unmount()
    client.dispose()
  })
})
