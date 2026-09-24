import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { findSharedOutDirs, sharedOutDirMessage } from "./shared-out-dir.js"
import type { CanisterConfig } from "./types.js"

let projectRoot: string

beforeEach(() => {
  projectRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-shared-out-dir-"))
  )
})

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

const entry = (
  name: string,
  config: Partial<CanisterConfig> = {}
): CanisterConfig => ({ name, didFile: `./${name}.did`, ...config })

/** Run the check over entries keyed as an `ic-reactor.json` keys them. */
const shared = (canisters: Record<string, CanisterConfig>) =>
  findSharedOutDirs(Object.entries(canisters), "src/declarations", projectRoot)

describe("findSharedOutDirs", () => {
  it("reports nothing when every entry has its own directory", () => {
    expect(
      shared({
        backend: entry("backend"),
        ledger: entry("ledger"),
        raw: entry("backend", { outDir: "src/raw" }),
      })
    ).toEqual(new Map())
  })

  // Copying an entry and changing only its key keeps its `name`, so both
  // resolve to <outDir>/<name>.
  it("maps a later entry with the same name under the global outDir to the first", () => {
    expect(
      shared({
        backend: entry("backend"),
        display: entry("backend", { mode: "Reactor" }),
        copy: entry("backend"),
      })
    ).toEqual(
      new Map([
        ["display", "backend"],
        ["copy", "backend"],
      ])
    )
  })

  it("maps an explicit outDir that equals another entry's directory", () => {
    expect(
      shared({
        backend: entry("backend"),
        ledger: entry("ledger", { outDir: "./src/declarations/backend/" }),
      })
    ).toEqual(new Map([["ledger", "backend"]]))
  })

  it("compares directories by their real location", () => {
    fs.mkdirSync(path.join(projectRoot, "src/declarations/backend"), {
      recursive: true,
    })
    fs.symlinkSync(
      path.join(projectRoot, "src/declarations/backend"),
      path.join(projectRoot, "src/linked"),
      "junction"
    )

    expect(
      shared({
        backend: entry("backend"),
        ledger: entry("ledger", { outDir: "src/linked" }),
      })
    ).toEqual(new Map([["ledger", "backend"]]))
  })

  // The vite plugin keys entries by the entry object, and an array can hold one
  // object twice.
  it("treats a key listed twice as one entry", () => {
    const backend = entry("backend")
    const copy = entry("backend")

    expect(
      findSharedOutDirs(
        [
          [backend, backend],
          [backend, backend],
          [copy, copy],
        ],
        "src/declarations",
        projectRoot
      )
    ).toEqual(new Map([[copy, backend]]))
  })

  // The pipeline reports these entries' own errors. The check must neither
  // throw on them nor let one claim a directory.
  it("skips an entry whose name or outDir the pipeline rejects", () => {
    expect(
      shared({
        bad: entry("../escape"),
        outside: entry("backend", { outDir: "../elsewhere" }),
        backend: entry("backend"),
      })
    ).toEqual(new Map())
  })

  // clientManagerPath plays no part in where an entry generates, so an error
  // there must not hide its directory from the check.
  it("still counts an entry whose other fields the pipeline rejects", () => {
    expect(
      shared({
        backend: entry("backend", {
          clientManagerPath: "https://example.com/x",
        }),
        ledger: entry("backend"),
      })
    ).toEqual(new Map([["ledger", "backend"]]))
  })
})

describe("sharedOutDirMessage", () => {
  it("names both entries and the fix", () => {
    expect(sharedOutDirMessage("ledger", 'canister "backend"')).toBe(
      'ledger: generates into the same output directory as canister "backend". ' +
        "Each run replaces that directory's declarations and index.generated.ts, " +
        'so the two would overwrite each other. Give each canister its own "outDir", ' +
        'or its own "name" if it uses the global outDir.'
    )
  })
})
