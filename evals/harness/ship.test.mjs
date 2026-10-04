// Tests of what the v4 condition ships (setup.mjs, harness/ship.mjs): the
// refusals on seeded files and local tarball fixtures (offline), and the tree
// the last `node setup.mjs [--v4-from npm:<version>]` built. One test asks
// the npm registry whether it still records the pinned integrity; it is
// skipped, with the reason, when the registry cannot be reached.
//
//   node --test harness/ship.test.mjs
import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
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
  V4_NPM_RELEASES,
  V4_PACKAGES,
  V4_PACKAGE_ENTRIES,
  V4_SHARED_BUILD_INPUTS,
  V4_SHARED_WITH_WORLD,
  describeV4Source,
  fetchV4Tarballs,
  guideStats,
  hiddenTestNames,
  integrityOf,
  namedInCode,
  parseV4From,
  tarballName,
  v4ShipFindings,
  v4Source,
  v4TarballFindings,
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

// `--v4-from npm:<version>`, offline: tarballs built here stand in for the
// downloaded ones, and a pin table built from them for V4_NPM_RELEASES.
describe("the v4 tree source's dirty check", () => {
  it("covers every file outside packages/ that a v4 package's tsconfig extends", () => {
    for (const name of V4_PACKAGES) {
      const dir = join(REPO, "packages", name.split("/")[1])
      for (const file of readdirSync(dir).filter((f) =>
        /^tsconfig.*\.json$/.test(f)
      )) {
        const extended = /"extends"\s*:\s*"([^"]+)"/.exec(
          readFileSync(join(dir, file), "utf8")
        )?.[1]
        if (!extended) continue
        const target = relative(
          REPO,
          resolve(dirname(join(dir, file)), extended)
        )
        if (target.startsWith("packages/")) continue
        assert.ok(
          V4_SHARED_BUILD_INPUTS.includes(target),
          `${name}/${file} extends ${target}, which V4_SHARED_BUILD_INPUTS does not list`
        )
      }
    }
  })
  it("lists only files that exist at the repository root", () => {
    for (const file of V4_SHARED_BUILD_INPUTS)
      assert.ok(
        existsSync(join(REPO, file)),
        `${file} is not in the repository`
      )
  })
})

describe("the v4 npm source", () => {
  let dir
  let releases
  const version = "9.0.0-fixture.1"
  const file = (name) => join(dir, tarballName(name, version))
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "ic-reactor-evals-ship-npm-"))
    for (const name of V4_PACKAGES) {
      const pkg = join(dir, "src", name, "package")
      mkdirSync(pkg, { recursive: true })
      writeFileSync(
        join(pkg, "package.json"),
        JSON.stringify({ name, version }) + "\n"
      )
      writeFileSync(join(pkg, "llms.txt"), `# ${name}\n`)
      const tar = spawnSync(
        "tar",
        ["-czf", file(name), "-C", join(dir, "src", name), "package"],
        { encoding: "utf8" }
      )
      assert.equal(tar.status, 0, tar.stderr)
    }
    releases = {
      [version]: Object.fromEntries(
        V4_PACKAGES.map((name) => [name, integrityOf(file(name))])
      ),
    }
  })
  after(() => rmSync(dir, { recursive: true, force: true }))

  it("takes --v4-from tree by default, npm:<version> for a pinned version, and nothing else", () => {
    assert.deepEqual(parseV4From(), { from: "tree" })
    assert.deepEqual(parseV4From("tree"), { from: "tree" })
    assert.deepEqual(parseV4From(`npm:${version}`, releases), {
      from: "npm",
      version,
    })
    assert.throws(
      () => parseV4From("npm:9.9.9", releases),
      /no pinned integrity/
    )
    assert.throws(
      () => parseV4From("npm:", releases),
      /"tree" or "npm:<version>"/
    )
    assert.throws(
      () => parseV4From("4.0.0-beta.1"),
      /"tree" or "npm:<version>"/
    )
  })
  it("pins both packages of 4.0.0-beta.1, the release Addendum 4 measures", () => {
    assert.deepEqual(Object.keys(V4_NPM_RELEASES["4.0.0-beta.1"]), V4_PACKAGES)
    for (const integrity of Object.values(V4_NPM_RELEASES["4.0.0-beta.1"]))
      assert.match(integrity, /^sha512-[A-Za-z0-9+/]{86}==$/)
  })
  it("computes the integrity string npm records (sha512, base64)", () => {
    const abc = join(dir, "abc")
    writeFileSync(abc, "abc")
    assert.equal(
      integrityOf(abc),
      "sha512-3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw=="
    )
  })
  it("accepts tarballs with the pinned integrity that the registry also records", () => {
    assert.deepEqual(
      v4TarballFindings(dir, version, {
        releases,
        registry: releases[version],
      }),
      []
    )
  })
  it("refuses a tarball one byte away from the pin", () => {
    const target = file("@ic-reactor/react")
    const bytes = readFileSync(target)
    try {
      writeFileSync(target, Buffer.concat([bytes, Buffer.from([0])]))
      const findings = v4TarballFindings(dir, version, { releases })
      assert.equal(findings.length, 1, findings.join("\n"))
      assert.match(
        findings[0],
        /^@ic-reactor\/react@9\.0\.0-fixture\.1: the tarball's integrity is sha512-/
      )
    } finally {
      writeFileSync(target, bytes)
    }
  })
  it("refuses a missing tarball", () => {
    const target = file("@ic-reactor/core")
    const bytes = readFileSync(target)
    try {
      rmSync(target)
      assert.deepEqual(v4TarballFindings(dir, version, { releases }), [
        `@ic-reactor/core@${version}: no tarball ${tarballName("@ic-reactor/core", version)}`,
      ])
    } finally {
      writeFileSync(target, bytes)
    }
  })
  it("refuses when the registry records another integrity than the pin", () => {
    const registry = {
      ...releases[version],
      "@ic-reactor/core": integrityOf(file("@ic-reactor/react")),
    }
    const findings = v4TarballFindings(dir, version, { releases, registry })
    assert.equal(findings.length, 1, findings.join("\n"))
    assert.match(findings[0], /^@ic-reactor\/core@.*: the registry records /)
  })
  describe("fetchV4Tarballs (setup's npm download, with npm faked)", () => {
    /** A fake `npm pack`: copies the fixture tarball into the target dir. */
    const fakeNpm = (recorded) => {
      const calls = []
      return {
        calls,
        pack: (to, name, v) => {
          calls.push(`pack ${name}@${v}`)
          writeFileSync(
            join(to, tarballName(name, v)),
            readFileSync(file(name))
          )
        },
        view: (_to, name, v) => {
          calls.push(`view ${name}@${v}`)
          return recorded[name]
        },
      }
    }
    const fetchInto = (recorded) => {
      const to = mkdtempSync(join(tmpdir(), "ic-reactor-evals-fetch-"))
      const npm = fakeNpm(recorded)
      try {
        return {
          calls: npm.calls,
          error: (() => {
            try {
              fetchV4Tarballs(to, version, { ...npm, releases })
            } catch (error) {
              return error
            }
          })(),
          files: readdirSync(to).sort(),
        }
      } finally {
        rmSync(to, { recursive: true, force: true })
      }
    }
    it("packs and asks the registry for each package, and accepts the pinned tarballs", () => {
      const { calls, error, files } = fetchInto(releases[version])
      assert.equal(error, undefined, error?.message)
      assert.deepEqual(
        calls,
        V4_PACKAGES.flatMap((n) => [
          `pack ${n}@${version}`,
          `view ${n}@${version}`,
        ])
      )
      assert.deepEqual(
        files,
        V4_PACKAGES.map((n) => tarballName(n, version)).sort()
      )
    })
    it("throws when the registry records another integrity than the pin", () => {
      const { error } = fetchInto({
        ...releases[version],
        "@ic-reactor/react": integrityOf(file("@ic-reactor/core")),
      })
      assert.ok(error, "fetchV4Tarballs accepted a registry that disagrees")
      assert.match(
        error.message,
        /^setup: the npm tarballs are not the pinned 9\.0\.0-fixture\.1:\n  @ic-reactor\/react@9\.0\.0-fixture\.1: the registry records sha512-/
      )
    })
  })
  it("refuses a version with no pin", () => {
    assert.deepEqual(v4TarballFindings(dir, "9.9.9", { releases }), [
      "no pinned integrity for 9.9.9",
    ])
  })
  it("counts a guide's words as wc -w does", () => {
    const text = "  # Title\tone\n\nthree   `four`\n"
    const guide = join(dir, "guide.txt")
    writeFileSync(guide, text)
    const wc = spawnSync("wc", ["-w", guide], { encoding: "utf8" })
    assert.equal(
      guideStats(text).words,
      Number(wc.stdout.trim().split(/\s+/)[0])
    )
    assert.equal(guideStats(text).words, 5)
    assert.match(guideStats(text).sha256, /^[0-9a-f]{64}$/)
  })
  it("names its source in one line", () => {
    const guide = { words: 1974, sha256: "ab" }
    assert.match(
      describeV4Source({
        from: "npm",
        version: "4.0.0-beta.1",
        integrity: V4_NPM_RELEASES["4.0.0-beta.1"],
        guide,
      }),
      /^npm 4\.0\.0-beta\.1 \(@ic-reactor\/core sha512-qvxo.*; @ic-reactor\/react sha512-U0Bv.*\); guide 1974 words, sha256 ab$/
    )
    assert.match(
      describeV4Source({ from: "tree", commit: "abc123", dirty: true, guide }),
      /^packed from this repository at abc123 \(uncommitted changes\); guide 1974 words/
    )
    assert.match(describeV4Source(null), /run `node setup\.mjs`/)
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
    const { version } = JSON.parse(
      readFileSync(join(ship, "@ic-reactor", "core", "package.json"), "utf8")
    )
    const packed = spawnSync(
      "tar",
      [
        "-xOzf",
        join(ship, "..", "tarballs", tarballName("@ic-reactor/core", version)),
        "package/llms.txt",
      ],
      { encoding: "utf8" }
    )
    assert.equal(packed.status, 0, packed.stderr)
    assert.equal(readFileSync(join(docs, "llms.txt"), "utf8"), packed.stdout)
  })
  it("records its source: the tarballs installed, their integrity, the guide", () => {
    const source = v4Source()
    assert.ok(source, "no .ship/v4/source.json: run `node setup.mjs`")
    const lock = JSON.parse(
      readFileSync(join(ship, "..", "package-lock.json"), "utf8")
    ).packages
    for (const name of V4_PACKAGES) {
      const installed = JSON.parse(
        readFileSync(join(ship, ...name.split("/"), "package.json"), "utf8")
      ).version
      assert.equal(source.packages[name], installed, name)
      const file = join(ship, "..", "tarballs", tarballName(name, installed))
      assert.equal(integrityOf(file), source.integrity[name], name)
      // npm checked the tarball it installed against this integrity.
      assert.equal(
        lock[`node_modules/${name}`].integrity,
        source.integrity[name]
      )
      if (source.from === "npm") {
        assert.equal(installed, source.version, name)
        assert.equal(
          source.integrity[name],
          V4_NPM_RELEASES[source.version][name],
          `${name}: the pinned tarball`
        )
      }
    }
    assert.deepEqual(
      source.guide,
      guideStats(
        readFileSync(
          join(EVALS, "conditions", "v4", "docs", "llms.txt"),
          "utf8"
        )
      )
    )
  })
  it("pins what the npm registry records (skipped if the registry is unreachable)", (t) => {
    for (const [version, pins] of Object.entries(V4_NPM_RELEASES)) {
      for (const [name, pinned] of Object.entries(pins)) {
        const view = spawnSync(
          "npm",
          ["view", `${name}@${version}`, "dist.integrity", "--json"],
          { encoding: "utf8", timeout: 30_000 }
        )
        if (
          view.status !== 0 &&
          /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|network/i.test(
            view.stderr + (view.error?.message ?? "")
          )
        ) {
          t.skip(
            `the npm registry is unreachable: ${view.stderr.trim().split("\n")[0]}`
          )
          return
        }
        assert.equal(view.status, 0, view.stderr)
        assert.equal(JSON.parse(view.stdout), pinned, `${name}@${version}`)
      }
    }
  })
  it("scores against the same install it ships", () => {
    // A package shared with the world is a link in the scorer's copy (next
    // test), so only its entry is listed there, not its files.
    const list = (root) =>
      readdirSync(root, { recursive: true })
        .map(String)
        .filter((f) => !f.startsWith(".vite") && !f.startsWith(".cache"))
        .filter((f) => !V4_SHARED_WITH_WORLD.some((n) => f.startsWith(`${n}/`)))
        .sort()
    assert.deepEqual(list(scored), list(ship))
  })
  it("scores with the world's own instance of @icp-sdk/core", () => {
    // Where each side resolves it from: the world from evals/harness; the
    // solution and the hidden tests from the scoring directory, whose
    // node_modules links to conditions/v4/node_modules; the v4 packages
    // from their own directories there.
    const resolved = (from) =>
      realpathSync(createRequire(from).resolve("@icp-sdk/core/agent"))
    const world = resolved(join(EVALS, "harness", "world.ts"))
    for (const from of [
      join(EVALS, "conditions", "v4", "solution.ts"),
      ...V4_PACKAGES.map((n) => join(scored, ...n.split("/"), "package.json")),
      join(scored, "@icp-sdk", "auth", "package.json"),
    ]) {
      assert.equal(resolved(from), world, from)
    }
    for (const name of V4_SHARED_WITH_WORLD) {
      const link = join(scored, ...name.split("/"))
      assert.ok(lstatSync(link).isSymbolicLink(), `${name} is a link`)
      const version = (root) =>
        JSON.parse(
          readFileSync(join(root, ...name.split("/"), "package.json"), "utf8")
        ).version
      assert.equal(
        version(scored),
        version(ship),
        `${name}: the version shipped`
      )
    }
    // No second copy nested anywhere in the scorer's install.
    const copies = readdirSync(scored, { recursive: true })
      .map(String)
      .filter((f) =>
        V4_SHARED_WITH_WORLD.some((n) => f.endsWith(`node_modules/${n}`))
      )
    assert.deepEqual(copies, [])
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
