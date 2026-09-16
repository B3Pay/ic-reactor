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

  // The pipeline refuses an outDir that another canister owns, and it learns
  // the owner from a file each run writes. buildStart starts every canister at
  // once, and a clean checkout, which is what CI builds, has no such file yet.
  // The guard therefore depends on each run claiming the directory before its
  // first await.
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
    const context = {
      error: vi.fn((message: string) => {
        throw new Error(message)
      }),
    }

    await expect(plugin.buildStart.call(context)).rejects.toThrowError(
      /beta: .*Two canisters cannot share an outDir/
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
})
