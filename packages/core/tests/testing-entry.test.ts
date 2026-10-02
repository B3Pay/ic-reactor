/**
 * What the testing entry is: exactly `createTestClient` at runtime (the type
 * `TestHandlers` is the second planned name, and has no runtime), in modules
 * the main entry never reaches. The export budget gate (`pnpm check:exports`)
 * reads the built declarations; this reads what Node or a bundler would load.
 */
import { existsSync, readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import * as entry from "../src/testing/index.js"

const src = resolve(import.meta.dirname, "..", "src")

/** The relative modules `file` imports, and the packages it imports. */
function importsOf(file: string): { local: string[]; packages: string[] } {
  const source = readFileSync(file, "utf8")
  const local: string[] = []
  const packages: string[] = []
  for (const [, specifier] of source.matchAll(
    /(?:from|import\()\s*"([^"]+)"/g
  )) {
    if (!specifier.startsWith(".")) {
      packages.push(specifier)
      continue
    }
    const target = resolve(dirname(file), specifier.replace(/\.js$/, ".ts"))
    if (existsSync(target)) local.push(target)
  }
  return { local, packages }
}

/** Every module reachable from `file` through relative imports, with the packages they import. */
function reachableFrom(file: string) {
  const modules = new Set<string>()
  const packages = new Set<string>()
  const pending = [file]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (modules.has(next)) continue
    modules.add(next)
    const found = importsOf(next)
    found.packages.forEach((name) => packages.add(name))
    pending.push(...found.local)
  }
  return {
    modules: [...modules].map((module) => relative(src, module)),
    packages: [...packages],
  }
}

describe("the testing entry", () => {
  it("exports exactly createTestClient at runtime", () => {
    // Pinned whole, as a list, so that a fake replica or an auth re-exported
    // for convenience is a red test rather than a quiet extra name.
    expect(Object.keys(entry)).toEqual(["createTestClient"])
    expect(typeof entry.createTestClient).toBe("function")
  })

  it("is not reached by the main entry, so none of it, nor @noble/curves, reaches an app bundle", () => {
    const main = reachableFrom(resolve(src, "index.ts"))

    expect(main.modules).toContain("client.ts")
    expect(main.modules.filter((path) => path.startsWith("testing"))).toEqual(
      []
    )
    expect(main.packages).not.toContain("@noble/curves")
    // The test client itself does reach it, through the fake replica.
    const testing = reachableFrom(resolve(src, "testing", "index.ts"))
    expect(testing.modules).toContain("client.ts")
    expect(testing.packages.some((name) => name.startsWith("@noble/"))).toBe(
      true
    )
  })
})
