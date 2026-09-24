/**
 * buildStart against the real @ic-reactor/codegen pipeline and a real
 * filesystem.
 *
 * index.test.ts mocks the pipeline, which is right for the plugin's own
 * branching but cannot show how the plugin's calls interact with guards the
 * pipeline keeps on disk. The shared-outDir guard is one of those.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { icReactor } from "./index.js"

const service = (method: string) =>
  `service : {\n  ${method} : () -> (text) query;\n}\n`

describe("buildStart with the real codegen pipeline", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
    tempDirs.length = 0
    vi.restoreAllMocks()
  })

  function createProject(): string {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-vite-plugin-"))
    )
    tempDirs.push(root)
    return root
  }

  /** The part of Rollup's plugin context buildStart uses. */
  function buildContext({ watchMode }: { watchMode: boolean }) {
    return {
      error: vi.fn((message: string) => {
        throw new Error(message)
      }),
      addWatchFile: vi.fn(),
      meta: { watchMode },
    }
  }

  // `vite build --watch` calls buildStart for every rebuild, whichever file
  // started it. Each run replaced the generated files, which are in the module
  // graph, so the watcher started another rebuild, and one edit to any source
  // file looped forever.
  it("regenerates on a watch rebuild only the canisters whose .did changed", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const root = createProject()
    fs.writeFileSync(path.join(root, "alpha.did"), service("alpha_v1"))
    fs.writeFileSync(path.join(root, "beta.did"), service("beta_v1"))

    const plugin = icReactor({
      canisters: [
        { name: "alpha", didFile: "alpha.did" },
        { name: "beta", didFile: "beta.did" },
      ],
      target: "core",
    }) as any
    plugin.configResolved({ root, command: "build" })
    const context = buildContext({ watchMode: true })

    // The identity of every generated entry. Replacing a file or the
    // declarations directory gives it a new inode even when the bytes match.
    const generated = (name: string) => {
      const outDir = path.join(root, "src/declarations", name)
      return [
        path.join(outDir, "index.generated.ts"),
        path.join(outDir, "declarations"),
        path.join(outDir, "declarations", `${name}.js`),
      ].map((entry) => fs.statSync(entry, { bigint: true }).ino)
    }

    await plugin.buildStart.call(context)
    const alpha = generated("alpha")
    const beta = generated("beta")

    // A rebuild that another file started.
    await plugin.buildStart.call(context)
    expect(generated("alpha")).toEqual(alpha)
    expect(generated("beta")).toEqual(beta)

    // A rebuild that a save to alpha.did started.
    fs.writeFileSync(path.join(root, "alpha.did"), service("alpha_v2"))
    await plugin.buildStart.call(context)
    expect(
      fs.readFileSync(
        path.join(root, "src/declarations/alpha/declarations/alpha.js"),
        "utf-8"
      )
    ).toContain("alpha_v2")
    expect(generated("beta")).toEqual(beta)
    expect(context.error).not.toHaveBeenCalled()
  })

  it("retries a canister that failed on the next watch rebuild", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    const root = createProject()
    fs.writeFileSync(path.join(root, "alpha.did"), service("alpha_v1"))

    const plugin = icReactor({
      // The outDir escapes the project, so the pipeline refuses it every time.
      canisters: [{ name: "alpha", didFile: "alpha.did", outDir: "../out" }],
      target: "core",
      failOnError: false,
    }) as any
    plugin.configResolved({ root, command: "build" })
    const errors = vi.mocked(console.error)

    await plugin.buildStart.call(buildContext({ watchMode: true }))
    await plugin.buildStart.call(buildContext({ watchMode: true }))

    expect(
      errors.mock.calls.filter(([message]) =>
        String(message).includes("alpha: Invalid outDir")
      )
    ).toHaveLength(2)
  })

  // A clean checkout, which is what CI builds, has no generated directories
  // and no owner marker yet, and buildStart starts every canister at once.
  it("refuses a second canister that shares an outDir on a clean checkout", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const root = createProject()
    fs.writeFileSync(path.join(root, "alpha.did"), service("alpha_only"))
    fs.writeFileSync(path.join(root, "beta.did"), service("beta_only"))

    const plugin = icReactor({
      canisters: [
        { name: "alpha", didFile: "alpha.did", outDir: "src/shared" },
        { name: "beta", didFile: "beta.did", outDir: "src/shared" },
      ],
      target: "core",
    }) as any
    plugin.configResolved({ root, command: "build" })
    const context = buildContext({ watchMode: false })

    await expect(plugin.buildStart.call(context)).rejects.toThrowError(
      /canisters\[1\] \("beta"\): generates into the same output directory as canisters\[0\] \("alpha"\)/
    )

    // The refused canister must not have replaced the output it collided with.
    const outDir = path.join(root, "src/shared")
    expect(fs.readdirSync(path.join(outDir, "declarations")).sort()).toEqual([
      "alpha.d.ts",
      "alpha.did",
      "alpha.js",
    ])
    expect(
      fs.readFileSync(path.join(outDir, "index.generated.ts"), "utf-8")
    ).toContain('name: "alpha"')
  })

  // The owner marker records a name, so it cannot tell two entries with the
  // same name apart. Both generated into one directory at once and the build
  // passed: over six builds, one emitted `new Reactor` and the rest
  // `new DisplayReactor`. The CLI refuses this config.
  it("fails the build when two entries share a name and an outDir", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const root = createProject()
    fs.writeFileSync(path.join(root, "backend.did"), service("greet"))

    const plugin = icReactor({
      canisters: [
        { name: "backend", didFile: "backend.did", mode: "DisplayReactor" },
        { name: "backend", didFile: "backend.did", mode: "Reactor" },
      ],
      target: "core",
    }) as any
    plugin.configResolved({ root, command: "build" })

    for (let build = 0; build < 2; build++) {
      const context = buildContext({ watchMode: false })
      await expect(plugin.buildStart.call(context)).rejects.toThrowError(
        'canisters[1] ("backend"): generates into the same output directory as ' +
          'canisters[0] ("backend"). Each run replaces that directory\'s ' +
          "declarations and index.generated.ts, so the two would overwrite each " +
          'other. Give each canister its own "outDir", or its own "name" if it ' +
          "uses the global outDir."
      )
      // The first entry keeps the directory, on every build.
      const generated = fs.readFileSync(
        path.join(root, "src/declarations/backend/index.generated.ts"),
        "utf-8"
      )
      expect(generated).toContain("new DisplayReactor")
      expect(generated).not.toContain("new Reactor")
    }
  })

  // The link dangles until the first entry generates, as a committed link
  // beside ignored output does in a new clone. Only the directory the first
  // entry creates shows that the second one reaches it.
  it("fails the build when an entry's outDir is a link to the directory an earlier entry creates", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const root = createProject()
    fs.writeFileSync(path.join(root, "backend.did"), service("backend_only"))
    fs.writeFileSync(path.join(root, "ledger.did"), service("ledger_only"))
    fs.mkdirSync(path.join(root, "src"))
    fs.symlinkSync(
      path.join(root, "src/declarations/backend"),
      path.join(root, "src/ledger"),
      "junction"
    )

    const plugin = icReactor({
      canisters: [
        { name: "backend", didFile: "backend.did" },
        { name: "backend", didFile: "ledger.did", outDir: "src/ledger" },
      ],
      target: "core",
    }) as any
    plugin.configResolved({ root, command: "build" })

    await expect(
      plugin.buildStart.call(buildContext({ watchMode: false }))
    ).rejects.toThrowError(
      /canisters\[1\] \("backend"\): generates into the same output directory as canisters\[0\]/
    )
    expect(
      fs.readFileSync(
        path.join(root, "src/declarations/backend/declarations/backend.js"),
        "utf-8"
      )
    ).toContain("backend_only")
    expect(
      fs.readdirSync(path.join(root, "src/declarations/backend/declarations"))
    ).not.toContain("ledger.js")
  })
})
