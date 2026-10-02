/**
 * What the package promises about its own shape: one exact `@candid-core/cli`
 * that pairs with the schema runtime, and two public exports.
 */
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { CANDID_CORE_CLI_VERSION, resolveCliBin } from "../src/generate.js"
import * as entry from "../src/index.js"

const PACKAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(
  fs.readFileSync(path.join(PACKAGE, "package.json"), "utf-8")
) as {
  peerDependencies: Record<string, string>
  devDependencies: Record<string, string>
}

describe("the @candid-core/cli pin", () => {
  // The app installs the generator that pairs with its schema runtime, so the
  // peer is one exact version and not a range (DECISIONS Q16).
  it("is one exact version, as a peer and as the dev dependency the tests run", () => {
    expect(CANDID_CORE_CLI_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
    expect(manifest.peerDependencies["@candid-core/cli"]).toBe(
      CANDID_CORE_CLI_VERSION
    )
    expect(manifest.devDependencies["@candid-core/cli"]).toBe(
      CANDID_CORE_CLI_VERSION
    )
  })

  it("is the version the tests install", () => {
    const installed = createRequire(import.meta.url).resolve(
      "@candid-core/cli/package.json"
    )
    expect(JSON.parse(fs.readFileSync(installed, "utf-8")).version).toBe(
      CANDID_CORE_CLI_VERSION
    )
  })

  it("resolves the bin script of the CLI an app has installed", () => {
    const bin = resolveCliBin(PACKAGE)

    expect(path.isAbsolute(bin)).toBe(true)
    expect(fs.existsSync(bin)).toBe(true)
    expect(path.basename(bin)).toBe("cli.js")
  })
})

describe("the public surface", () => {
  it("has two exports: icReactor and the type IcReactorPluginOptions", () => {
    expect(Object.keys(entry)).toEqual(["icReactor"])

    const exported = fs
      .readFileSync(path.join(PACKAGE, "src/index.ts"), "utf-8")
      .split("\n")
      .filter((line) => /^export\b/.test(line))
    expect(exported).toEqual([
      "export interface IcReactorPluginOptions {",
      "export function icReactor(options: IcReactorPluginOptions = {}): Plugin {",
    ])
  })
})
