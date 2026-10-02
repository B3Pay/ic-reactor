// Tests of what the v4 condition ships (setup.mjs, harness/ship.mjs): the
// refusal on seeded files, and the tree the last `node setup.mjs` built.
//
//   node --test harness/ship.test.mjs
import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import {
  EVALS,
  TASKS,
  assembleStarter,
  taskSpec,
  taskTests,
} from "./assemble.mjs"
import { checkDocs } from "./check-docs.mjs"
import {
  V4_PACKAGES,
  V4_PACKAGE_ENTRIES,
  hiddenTestNames,
  namedInCode,
  v4ShipFindings,
} from "./ship.mjs"
import { REPO } from "./runs.mjs"

describe("the v4 leak refusal", () => {
  let dir
  const pkg = (name) => join(dir, "node_modules", ...name.split("/"))
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "ic-reactor-evals-ship-test-"))
    for (const name of V4_PACKAGES) {
      mkdirSync(join(pkg(name), "dist"), { recursive: true })
      writeFileSync(
        join(pkg(name), "dist", "index.js"),
        "export const answer = 42\n"
      )
      writeFileSync(join(pkg(name), "package.json"), `{"name":"${name}"}\n`)
    }
    writeFileSync(
      join(pkg("@ic-reactor/core"), "llms.txt"),
      "# A guide\n\nCall the canister, then read the balance back.\n"
    )
  })
  after(() => rmSync(dir, { recursive: true, force: true }))

  it("looks for every hidden-test name in task.json, as written and spaced", () => {
    const names = hiddenTestNames()
    for (const task of TASKS) {
      for (const name of taskTests(taskSpec(task))) {
        assert.ok(names.includes(name), name)
        assert.ok(names.includes(name.replaceAll("_", " ")), name)
      }
    }
  })
  it("lets a clean tree ship", () => {
    assert.deepEqual(v4ShipFindings(dir), [])
  })
  it("refuses a guide that names a hidden test", () => {
    const guide = join(pkg("@ic-reactor/core"), "llms.txt")
    const clean = readFileSync(guide, "utf8")
    const [name] = hiddenTestNames()
    try {
      writeFileSync(guide, `${clean}\nSee ${name}.\n`)
      const findings = v4ShipFindings(dir)
      assert.ok(
        findings.some((f) => f.startsWith("guide ") && f.includes(name)),
        findings.join("\n")
      )
    } finally {
      writeFileSync(guide, clean)
    }
  })
  it("refuses package code that names a hidden test, spaced or not", () => {
    const file = join(pkg("@ic-reactor/react"), "dist", "extra.d.ts")
    const name = taskTests(taskSpec("node-tool")).at(-1)
    for (const written of [name, name.replaceAll("_", " ")]) {
      try {
        writeFileSync(file, `/** ${written.toUpperCase()} */\n`)
        const findings = v4ShipFindings(dir)
        assert.ok(
          findings.some((f) => f.startsWith("code @ic-reactor/react/dist/")),
          findings.join("\n")
        )
      } finally {
        rmSync(file, { force: true })
      }
    }
  })
  it("reads only code files", () => {
    const file = join(pkg("@ic-reactor/core"), "dist", "notes.bin")
    writeFileSync(file, hiddenTestNames()[0])
    try {
      assert.deepEqual(namedInCode(pkg("@ic-reactor/core")), [])
    } finally {
      rmSync(file, { force: true })
    }
  })
})

// The tree setup.mjs built (run `node setup.mjs` first, as for the sandbox
// test).
describe("the shipped v4 condition", () => {
  const ship = join(EVALS, ".ship", "v4", "node_modules")
  const scored = join(EVALS, "conditions", "v4", "node_modules")
  before(() => {
    if (!existsSync(ship))
      throw new Error(`missing ${ship}: run \`node setup.mjs\``)
  })

  it("ships each ic-reactor package as package.json + dist/ only", () => {
    for (const name of V4_PACKAGES) {
      const dir = join(ship, ...name.split("/"))
      assert.deepEqual(readdirSync(dir).sort(), V4_PACKAGE_ENTRIES, name)
      const manifest = JSON.parse(
        readFileSync(join(dir, "package.json"), "utf8")
      )
      assert.equal(manifest.name, name)
      assert.match(manifest.version, /^4\./, `${name} is ic-reactor 4`)
      const deps = JSON.stringify(manifest.dependencies ?? {})
      assert.ok(!deps.includes("workspace:"), `${name}: ${deps}`)
    }
  })
  it("ships no repository path and no hidden-test name", () => {
    const leaks = spawnSync("grep", ["-rlI", "-e", REPO, ship], {
      encoding: "utf8",
    }).stdout.trim()
    assert.equal(leaks, "")
    for (const name of V4_PACKAGES) {
      assert.deepEqual(namedInCode(join(ship, ...name.split("/"))), [])
    }
  })
  it("gives the core tarball's guide as the only doc, free of hidden tests", () => {
    const docs = join(EVALS, "conditions", "v4", "docs")
    assert.deepEqual(readdirSync(docs), ["llms.txt"])
    assert.deepEqual(checkDocs([join(docs, "llms.txt")]).hits, [])
  })
  it("scores against the same install it ships", () => {
    const list = (root) =>
      readdirSync(root, { recursive: true })
        .map(String)
        .filter((f) => !f.startsWith(".vite") && !f.startsWith(".cache"))
        .sort()
    assert.deepEqual(list(scored), list(ship))
  })
  it("assembles a starter with the CLI module, the guide and the installed versions", () => {
    const dest = mkdtempSync(join(tmpdir(), "ic-reactor-evals-ship-test-"))
    try {
      assembleStarter({ task: "react-wallet", condition: "v4", dest })
      assert.match(
        readFileSync(join(dest, "src", "generated", "icrc1.ts"), "utf8"),
        /^\/\/ Generated by candid-core-ts/
      )
      assert.deepEqual(readdirSync(join(dest, "docs")), ["llms.txt"])
      const { dependencies } = JSON.parse(
        readFileSync(join(dest, "package.json"), "utf8")
      )
      for (const name of V4_PACKAGES) {
        const installed = JSON.parse(
          readFileSync(join(ship, ...name.split("/"), "package.json"), "utf8")
        ).version
        assert.equal(dependencies[name], installed, name)
      }
      assert.equal(dependencies["@candid-core/schema"], "0.3.0-beta.1")
    } finally {
      rmSync(dest, { recursive: true, force: true })
    }
  })
})
