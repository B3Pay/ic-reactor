/**
 * Two `.did` files that name the same module collide, and whether `Ledger.did`
 * and `ledger.did` do depends on the filesystem of the output directory: they
 * are one file on macOS and Windows by default, and two on Linux.
 *
 * The comparison is tested with the answer of the filesystem injected, so that
 * what it decides does not depend on the machine the tests run on. The probe
 * that gives the answer is checked against what the machine does, and the
 * plugin against the probe.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { foldsCase, generate, resolveCliBin } from "../src/generate.js"
import { createApp, runBuild, type App } from "./support.js"

const apps: App[] = []
const directories: string[] = []

afterEach(() => {
  for (const app of apps.splice(0)) app.cleanup()
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

/**
 * An app with the stand-in CLI and three `.did` files, and what `generate`
 * needs of it. They are in directories of their own, so that they are three
 * files on every filesystem: it is the modules that may collide.
 */
function setup() {
  const app = createApp(
    {
      "one/Ledger.did": "ok\n",
      "two/ledger.did": "ok\n",
      "three/Ledger.did": "ok\n",
    },
    "fake"
  )
  apps.push(app)
  const at = (file: string) => path.join(app.root, file)
  return {
    app,
    at,
    request: {
      cli: resolveCliBin(app.root),
      root: app.root,
      timeoutMs: 10_000,
    },
  }
}

describe("canisters whose modules differ only in case", () => {
  it("collide where the output directory ignores case, and the second is refused", async () => {
    const { app, at, request } = setup()

    const { outcomes } = await generate({
      ...request,
      foldsCase: () => true,
      canisters: [
        { name: "upper", didFile: at("one/Ledger.did"), outDir: at("out") },
        { name: "lower", didFile: at("two/ledger.did"), outDir: at("out") },
      ],
    })

    expect(outcomes).toEqual([
      {
        names: ["lower"],
        status: "failed",
        omitted: [],
        failure:
          'would write out/ledger.ts, which "upper" already writes as out/Ledger.ts: the filesystem does not tell the two names apart. ' +
          "The generator names a module after its .did file: rename one file or give one canister its own outDir",
      },
      expect.objectContaining({ names: ["upper"], status: "written" }),
    ])
    // The generator was given the first only.
    expect(app.runs()).toEqual([
      ["gen", at("one/Ledger.did"), "-o", at("out"), "--json"],
    ])
  })

  it("write two modules where the output directory tells them apart", async () => {
    const { app, at, request } = setup()

    const { outcomes } = await generate({
      ...request,
      foldsCase: () => false,
      canisters: [
        { name: "upper", didFile: at("one/Ledger.did"), outDir: at("out") },
        { name: "lower", didFile: at("two/ledger.did"), outDir: at("out") },
      ],
    })

    expect(outcomes.map(({ names, status }) => ({ names, status }))).toEqual([
      { names: ["upper"], status: "written" },
      { names: ["lower"], status: "written" },
    ])
    expect(outcomes.map(({ module }) => module)).toEqual([
      at("out/Ledger.ts"),
      at("out/ledger.ts"),
    ])
    expect(app.runs()).toEqual([
      [
        "gen",
        at("one/Ledger.did"),
        at("two/ledger.did"),
        "-o",
        at("out"),
        "--json",
      ],
    ])
  })

  // A filesystem that cannot be told is compared exactly: a canister is never
  // refused on a guess.
  it("are taken for two files when the filesystem cannot be told", async () => {
    const { at, request } = setup()

    const { outcomes } = await generate({
      ...request,
      foldsCase: () => undefined,
      canisters: [
        { name: "upper", didFile: at("one/Ledger.did"), outDir: at("out") },
        { name: "lower", didFile: at("two/ledger.did"), outDir: at("out") },
      ],
    })

    expect(outcomes.map(({ status }) => status)).toEqual(["written", "written"])
  })

  it("ask each output directory once, and decide each by its own answer", async () => {
    const { at, request } = setup()
    const asked = vi.fn((dir: string) => dir.endsWith("folded"))

    const { outcomes } = await generate({
      ...request,
      foldsCase: asked,
      canisters: [
        { name: "a", didFile: at("one/Ledger.did"), outDir: at("plain") },
        { name: "b", didFile: at("two/ledger.did"), outDir: at("plain") },
        { name: "c", didFile: at("one/Ledger.did"), outDir: at("folded") },
        { name: "d", didFile: at("two/ledger.did"), outDir: at("folded") },
      ],
    })

    expect(asked.mock.calls.map(([dir]) => dir)).toEqual([
      at("plain"),
      at("folded"),
    ])
    // Told apart in `plain`, and one module in `folded`.
    expect(
      outcomes.map(({ names, status }) => `${names.join()} ${status}`).sort()
    ).toEqual(["a written", "b written", "c written", "d failed"])
  })

  it("are refused as before when the name is exactly the same, whatever the filesystem says", async () => {
    const { at, request } = setup()

    const { outcomes } = await generate({
      ...request,
      foldsCase: () => false,
      canisters: [
        { name: "one", didFile: at("one/Ledger.did"), outDir: at("out") },
        { name: "three", didFile: at("three/Ledger.did"), outDir: at("out") },
      ],
    })

    expect(outcomes[0]).toMatchObject({
      names: ["three"],
      status: "failed",
      failure: expect.stringContaining(
        'would write out/Ledger.ts, which "one" already writes. '
      ),
    })
  })
})

describe("the probe of the filesystem", () => {
  const directory = () => {
    const made = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-case-"))
    )
    directories.push(made)
    return made
  }

  /** What the machine does: whether a name is found by another spelling of its case. */
  const observe = (made: string) => {
    fs.writeFileSync(path.join(made, "Probe.txt"), "")
    return fs.existsSync(path.join(made, "pROBE.TXT"))
  }

  it("agrees with the machine for a directory that has files", () => {
    const made = directory()
    const expected = observe(made)

    expect(foldsCase(made)).toBe(expected)
  })

  it("agrees with the machine for a directory with nothing in it, and for one not made yet", () => {
    const made = directory()
    const expected = observe(made)
    const empty = path.join(made, "empty")
    fs.mkdirSync(empty)

    expect(foldsCase(empty)).toBe(expected)
    expect(foldsCase(path.join(made, "not", "made", "yet"))).toBe(expected)
  })

  it("does not throw for a path it cannot read", () => {
    const made = directory()
    const file = path.join(made, "file.txt")
    fs.writeFileSync(file, "")

    expect(["boolean", "undefined"]).toContain(
      typeof foldsCase(path.join(file, "below"))
    )
  })

  // The plugin asks the probe, and does not decide for itself.
  it("decides what the plugin generates", async () => {
    const { app } = setup()
    const expected = observe(app.root)
    const { result, lines } = runBuild(app.root, {
      failOnError: false,
      canisters: {
        upper: { didFile: "one/Ledger.did" },
        lower: { didFile: "two/ledger.did" },
      },
    })
    await result

    const refused = lines.some((line) =>
      line.includes("the filesystem does not tell the two names apart")
    )
    expect(refused).toBe(expected)
  })
})
