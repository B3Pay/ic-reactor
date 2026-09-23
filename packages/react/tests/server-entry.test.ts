/**
 * The `react-server` entry (#679).
 *
 * A React Server Component is bundled with the `react-server` export condition,
 * and the bundler rejects any module in that graph that imports a React hook.
 * The main entry loads every hook, so a server component that imported only
 * `Reactor` from `@ic-reactor/react` failed `next build`. `package.json` now
 * routes the condition to `src/server.ts`, and these tests pin the three things
 * that make that work: the condition is reachable, the entry carries the core
 * runtime under the same bindings as the main entry, and nothing it loads
 * imports React.
 */
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import * as core from "@ic-reactor/core"
import * as main from "../src/index.js"
import * as server from "../src/server.js"

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const readJson = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>

const manifest = readJson(join(PKG_DIR, "package.json")) as {
  exports: Record<string, Record<string, string> | string>
}

/** Modules that must never be reached from the server entry. */
const REACT_MODULE = /^(react|react-dom)(\/|$)|^@tanstack\/react-query(\/|$)/

// `import … from "x"`, `export … from "x"` and `import "x"`, capturing whether
// the statement is type-only (erased by tsc, so it loads nothing at run time).
const STATIC_IMPORT =
  /^\s*(?:import|export)\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g

/**
 * Every bare specifier the module graph under `entry` loads at run time,
 * following relative imports through the package's own sources.
 */
function runtimeBareImports(entry: string): Set<string> {
  const bare = new Set<string>()
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
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
      const candidates = [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`]
      const found = candidates.find((candidate) => existsSync(candidate))
      if (!found) throw new Error(`cannot resolve ${specifier} from ${file}`)
      visit(found)
    }
  }
  visit(join(PKG_DIR, entry))
  return bare
}

describe("the react-server entry", () => {
  it("is what the react-server condition resolves to, ahead of import/default", () => {
    const root = manifest.exports["."] as Record<string, string>
    const conditions = Object.keys(root)

    expect(root["react-server"]).toBe("./dist/server.js")
    // Conditions match in key order. `types` stays first for TypeScript, and
    // `react-server` has to precede the catch-all `import` / `default`, or a
    // server bundler matches those first and never reaches it.
    expect(conditions[0]).toBe("types")
    expect(conditions.indexOf("react-server")).toBeGreaterThan(0)
    expect(conditions.indexOf("react-server")).toBeLessThan(
      conditions.indexOf("import")
    )
    expect(conditions.indexOf("react-server")).toBeLessThan(
      conditions.indexOf("default")
    )
    // The target is what tsc emits for src/server.ts.
    expect(existsSync(join(PKG_DIR, "src/server.ts"))).toBe(true)
  })

  it("exports the whole core runtime", () => {
    const serverExports = server as Record<string, unknown>
    for (const [name, value] of Object.entries(core)) {
      expect(serverExports[name], `"${name}" missing`).toBe(value)
    }
  })

  it("exports the same bindings as the main entry, minus every hook", () => {
    const serverExports = server as Record<string, unknown>
    const mainExports = main as Record<string, unknown>

    // A subset of the main entry, binding for binding, so a class reached
    // through either entry is the same class.
    for (const name of Object.keys(serverExports)) {
      expect(mainExports[name], `"${name}" differs`).toBe(serverExports[name])
    }

    // Beyond core it adds only the framework-free validation helpers.
    expect(
      Object.keys(serverExports)
        .filter((name) => !(name in core))
        .sort()
    ).toEqual([
      "extractValidationErrors",
      "getFieldError",
      "getFieldErrors",
      "handleValidationError",
      "mapValidationErrors",
    ])

    // Everything that runs a hook, or builds hooks, stays behind.
    const omitted = Object.keys(mainExports).filter(
      (name) => !(name in serverExports)
    )
    expect(omitted).toEqual(
      expect.arrayContaining([
        "useReactorQuery",
        "useActorMethod",
        "createActorHooks",
        "createAuthHooks",
        "createIdentityAttributeHooks",
        "defineReactor",
        "createQuery",
        "createMutation",
      ])
    )
    expect(
      Object.keys(serverExports).filter((n) => /^use[A-Z]/.test(n))
    ).toEqual([])
  })

  it("loads nothing that imports React", () => {
    // The walker has to see React where it is imported, or the assertion
    // below would pass for a walker that finds nothing.
    expect([...runtimeBareImports("src/index.ts")]).toEqual(
      expect.arrayContaining(["react", "@tanstack/react-query"])
    )

    const serverImports = [...runtimeBareImports("src/server.ts")]
    expect(serverImports).toContain("@ic-reactor/core")
    expect(serverImports.filter((s) => REACT_MODULE.test(s))).toEqual([])

    // Core is reached as a package. It cannot import React without declaring
    // it, since a strict install would not resolve an undeclared dependency.
    const coreManifest = readJson(
      join(PKG_DIR, "node_modules/@ic-reactor/core/package.json")
    ) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const coreDeps = [
      ...Object.keys(coreManifest.dependencies ?? {}),
      ...Object.keys(coreManifest.peerDependencies ?? {}),
    ]
    expect(coreDeps.filter((dep) => REACT_MODULE.test(dep))).toEqual([])
  })
})
