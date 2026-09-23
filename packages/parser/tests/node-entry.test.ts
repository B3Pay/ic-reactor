import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { afterAll, beforeAll, describe, it, expect } from "vitest"

// A consumer resolves this package through its exports map. The other tests
// import dist paths directly, which skips the map, so these set up a separate
// project that installs the package through a node_modules link and resolve it
// with real Node and with TypeScript's nodenext resolution.

const packageDir = fileURLToPath(new URL("..", import.meta.url))

/** The `ts` code block under the README's "Example" heading. */
function readmeExample(): string {
  const readme = readFileSync(join(packageDir, "README.md"), "utf-8")
  const example = readme
    .split(/^## Example$/m)[1]
    ?.match(/```ts\n([\s\S]*?)```/)?.[1]
  if (!example) {
    throw new Error('README.md has no ts code block under "## Example"')
  }
  return example
}

let project = ""

function runNode(args: string[]): string {
  return execFileSync(process.execPath, args, {
    cwd: project,
    encoding: "utf-8",
  })
}

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), "ic-reactor-parser-consumer-"))
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" })
  )
  mkdirSync(join(project, "node_modules", "@ic-reactor"), { recursive: true })
  symlinkSync(
    packageDir,
    join(project, "node_modules", "@ic-reactor", "parser"),
    "junction"
  )
  // The README example is plain JavaScript as well as TypeScript.
  writeFileSync(join(project, "example.mjs"), readmeExample())
  writeFileSync(join(project, "example.ts"), readmeExample())
})

afterAll(() => {
  rmSync(project, { recursive: true, force: true })
})

describe("Node entry points", () => {
  it("runs the README example as an ES module, await init() included", () => {
    const output = runNode(["example.mjs"])

    expect(output).toContain("export const idlFactory")
    expect(output).toContain("export interface _SERVICE")
  })

  it("exports initSync to ES modules", () => {
    const output = runNode([
      "--input-type=module",
      "-e",
      'import { initSync, validateIDL } from "@ic-reactor/parser"; initSync(); console.log(validateIDL("service : {}"))',
    ])

    expect(output.trim()).toBe("true")
  })

  it("still loads with require", () => {
    const output = runNode([
      "--input-type=commonjs",
      "-e",
      'const parser = require("@ic-reactor/parser"); console.log(typeof parser.didToJs, parser.validateIDL("service : {}"))',
    ])

    expect(output.trim()).toBe("function true")
  })

  it("gives import and require the same instance", () => {
    const output = runNode([
      "--input-type=module",
      "-e",
      'import { createRequire } from "node:module"; import { didToJs } from "@ic-reactor/parser"; console.log(createRequire(import.meta.url)("@ic-reactor/parser").didToJs === didToJs)',
    ])

    expect(output.trim()).toBe("true")
  })

  it("type-checks the README example under nodenext", () => {
    const program = ts.createProgram([join(project, "example.ts")], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      noEmit: true,
      types: [],
    })
    const errors = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      )

    expect(errors).toEqual([])
    // A full TypeScript program is checked here; on a busy CI runner that can
    // take longer than vitest's 5 s default (it timed out on #740's run).
  }, 30_000)
})
