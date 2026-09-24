/**
 * `@ic-reactor/core/testing` is a subpath of its own so that an app's bundle
 * never carries the fake replica or `@noble/curves`, which it signs with.
 * These guards keep it that way: nothing the main entry reaches may import the
 * testing modules or the curves, and the curves stay an optional peer rather
 * than a dependency every install of the package would pull in.
 */
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import * as core from "../src/index.js"
import * as testing from "../src/testing/index.js"

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// `import … from "x"`, `export … from "x"` and `import "x"`, capturing whether
// the statement is type-only (erased by tsc, so it loads nothing at run time).
const STATIC_IMPORT =
  /^\s*(?:import|export)\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g

/**
 * The package's own modules and the bare specifiers the module graph under
 * `entry` loads at run time, following relative imports through its sources.
 */
function runtimeGraph(entry: string) {
  const modules = new Set<string>()
  const bare = new Set<string>()
  const visit = (file: string) => {
    if (modules.has(file)) return
    modules.add(file)
    const source = readFileSync(file, "utf8")
    const specifiers = [
      ...[...source.matchAll(STATIC_IMPORT)]
        .filter((match) => !match[1])
        .map((match) => match[2]),
      ...[...source.matchAll(DYNAMIC_IMPORT)].map((match) => match[1]),
    ]
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) {
        bare.add(specifier)
        continue
      }
      const target = resolve(dirname(file), specifier.replace(/\.js$/, ""))
      const found = [`${target}.ts`, `${target}/index.ts`].find((candidate) =>
        existsSync(candidate)
      )
      if (!found) throw new Error(`cannot resolve ${specifier} from ${file}`)
      visit(found)
    }
  }
  visit(join(packageDir, entry))
  return {
    modules: [...modules].map((file) => relative(packageDir, file)),
    bare: [...bare],
  }
}

describe("the testing entry", () => {
  it("exports the fake replica and the test canister builder", () => {
    expect(Object.keys(testing).sort()).toEqual([
      "createTestCanister",
      "installFakeReplica",
    ])
  })

  it("is not part of the main entry", () => {
    expect(core).not.toHaveProperty("installFakeReplica")
    expect(core).not.toHaveProperty("createTestCanister")
  })

  it("is not reached from the main entry, nor is @noble/curves", () => {
    const main = runtimeGraph("src/index.ts")

    expect(main.modules.filter((file) => file.includes("testing"))).toEqual([])
    expect(main.bare.filter((name) => name.startsWith("@noble/"))).toEqual([])
  })

  it("is what loads @noble/curves", () => {
    // The graph walk above would find nothing to refuse if it could not see
    // the curves at all.
    expect(runtimeGraph("src/testing/index.ts").bare).toContain(
      "@noble/curves/bls12-381.js"
    )
  })

  it("is exported as ./testing, with @noble/curves an optional peer", () => {
    const manifest = JSON.parse(
      readFileSync(join(packageDir, "package.json"), "utf8")
    ) as {
      exports: Record<string, unknown>
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
    }

    expect(manifest.exports["./testing"]).toEqual({
      types: "./dist/testing/index.d.ts",
      import: "./dist/testing/index.js",
      default: "./dist/testing/index.js",
    })
    expect(manifest.dependencies).not.toHaveProperty("@noble/curves")
    expect(manifest.peerDependencies).toHaveProperty("@noble/curves")
    expect(manifest.peerDependenciesMeta?.["@noble/curves"]?.optional).toBe(
      true
    )
  })
})
