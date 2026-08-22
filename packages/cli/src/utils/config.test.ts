import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { CONFIG_FILE_NAME, findConfigFile, loadConfig } from "./config.js"

describe("loadConfig", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
    tempDirs.length = 0
  })

  function writeConfig(contents: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-cli-config-"))
    tempDirs.push(dir)
    const configPath = path.join(dir, CONFIG_FILE_NAME)
    fs.writeFileSync(configPath, contents)
    return configPath
  }

  const valid = {
    outDir: "src/declarations",
    canisters: {
      backend: { name: "backend", didFile: "./backend.did" },
    },
  }

  it("accepts a well-formed config", () => {
    const configPath = writeConfig(JSON.stringify(valid))
    expect(loadConfig(configPath)).toEqual(valid)
  })

  it("keeps unknown keys, which the JSON schema also allows", () => {
    const configPath = writeConfig(
      JSON.stringify({ ...valid, futureOption: true })
    )
    expect(loadConfig(configPath)).toMatchObject({ futureOption: true })
  })

  it("names the file and the mistyped key when 'canisters' is misspelled", () => {
    const configPath = writeConfig(
      JSON.stringify({
        outDir: "src/declarations",
        canister: { backend: { name: "backend", didFile: "./backend.did" } },
      })
    )

    // Before validation this threw
    // `TypeError: Cannot convert undefined or null to object` from
    // `Object.keys(config.canisters)`, with a stack into bundled dist code that
    // never mentioned the config file.
    expect(() => loadConfig(configPath)).toThrow(CONFIG_FILE_NAME)
    expect(() => loadConfig(configPath)).toThrow(configPath)
    expect(() => loadConfig(configPath)).toThrow(/"canisters" is required/)
    expect(() => loadConfig(configPath)).toThrow(/did you mean/)
  })

  it("names the canister and field when a canister entry is incomplete", () => {
    const configPath = writeConfig(
      JSON.stringify({
        outDir: "src/declarations",
        canisters: { backend: { name: "backend" } },
      })
    )

    expect(() => loadConfig(configPath)).toThrow(
      /"canisters\.backend\.didFile" is required/
    )
  })

  it("rejects a canisters map that is not an object", () => {
    const configPath = writeConfig(
      JSON.stringify({ outDir: "src/declarations", canisters: [] })
    )

    expect(() => loadConfig(configPath)).toThrow(
      /"canisters" must be an object keyed by canister name, found an array/
    )
  })

  it("rejects an out-of-range enum with the allowed values", () => {
    const configPath = writeConfig(
      JSON.stringify({ ...valid, target: "reactive" })
    )

    expect(() => loadConfig(configPath)).toThrow(
      /"target" must be one of "react", "core"/
    )
  })

  it("reports invalid JSON as a parse failure naming the file", () => {
    const configPath = writeConfig(`{ "outDir": "src/declarations", }`)

    expect(() => loadConfig(configPath)).toThrow(
      new RegExp(`${CONFIG_FILE_NAME} at .* is not valid JSON`)
    )
  })

  it("returns null when there is no config file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-cli-empty-"))
    tempDirs.push(dir)

    expect(loadConfig(path.join(dir, CONFIG_FILE_NAME))).toBeNull()
  })
})

describe("findConfigFile", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
    tempDirs.length = 0
  })

  it("walks up to the nearest ancestor config", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-cli-find-"))
    tempDirs.push(root)
    fs.writeFileSync(path.join(root, CONFIG_FILE_NAME), "{}")
    const nested = path.join(root, "packages", "app")
    fs.mkdirSync(nested, { recursive: true })

    expect(findConfigFile(nested)).toBe(path.join(root, CONFIG_FILE_NAME))
  })

  it("returns null when no ancestor has one", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-cli-none-"))
    tempDirs.push(root)

    expect(findConfigFile(root)).toBeNull()
  })
})
