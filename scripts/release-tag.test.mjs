/**
 * Tests of the release lane's version rules (scripts/release-tag.mjs): what
 * release.yml publishes for a tag, and what scripts/release.js accepts.
 *
 * A stable 4.x version goes to `latest` and takes the GitHub "Latest" badge, a
 * 4.x prerelease goes to `beta` and never to `latest`, and every other tag
 * (3.x, 5.x, not semver) is refused. release.js is run from a copy of
 * scripts/ in a temporary repository, so a refusal that failed to stop it
 * could only bump the copy's manifests.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { after, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { RELEASE_MAJOR, releaseFor } from "./release-tag.mjs"

const scriptsDir = dirname(fileURLToPath(import.meta.url))

const temps = []
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

describe("releaseFor", () => {
  it("releases 4.x only", () => {
    assert.equal(RELEASE_MAJOR, 4)
  })

  for (const tag of ["v4.0.0", "4.0.0", "v4.1.0", "v4.12.3"]) {
    it(`publishes the stable ${tag} under latest, as the latest release`, () => {
      assert.deepEqual(releaseFor(tag), {
        version: tag.replace(/^v/, ""),
        prerelease: false,
        distTag: "latest",
        makeLatest: true,
      })
    })
  }

  for (const tag of [
    "v4.0.0-beta.2",
    "4.0.0-rc.0",
    "v4.1.0-alpha.1",
    "v4.0.1-next",
  ]) {
    it(`publishes the prerelease ${tag} under beta, never latest`, () => {
      const release = releaseFor(tag)
      assert.equal(release.prerelease, true)
      assert.equal(release.distTag, "beta")
      assert.equal(release.makeLatest, false)
    })
  }

  for (const tag of [
    "v3.13.1",
    "v3.0.0-beta.1",
    "v5.0.0",
    "v0.15.2",
    "v40.0.0",
  ]) {
    it(`refuses ${tag}, which is not 4.x`, () => {
      assert.throws(() => releaseFor(tag), /is not a 4\.x version/)
    })
  }

  for (const tag of [
    "",
    undefined,
    "v4",
    "v4.0",
    "4.0.0.0",
    "v4.0.0+build.1",
    "4.0.0-01",
    "v4.0.0-",
    "tools-v4.0.0",
    "v4.0.0 ",
  ]) {
    it(`refuses ${JSON.stringify(tag)}, which is not a release version`, () => {
      assert.throws(() => releaseFor(tag), /is not a release version/)
    })
  }
})

function runNode(args, cwd) {
  return spawnSync(process.execPath, args, { cwd, encoding: "utf8" })
}

describe("release-tag.mjs as release.yml runs it", () => {
  it("prints the GITHUB_OUTPUT lines of a stable tag", () => {
    const result = runNode([join(scriptsDir, "release-tag.mjs"), "v4.0.0"])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(
      result.stdout,
      "version=4.0.0\ndist_tag=latest\nprerelease=false\nmake_latest=true\n"
    )
  })

  it("prints the GITHUB_OUTPUT lines of a prerelease tag", () => {
    const result = runNode([
      join(scriptsDir, "release-tag.mjs"),
      "v4.0.0-beta.2",
    ])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(
      result.stdout,
      "version=4.0.0-beta.2\ndist_tag=beta\nprerelease=true\nmake_latest=false\n"
    )
  })

  it("fails a 3.x tag with nothing on stdout", () => {
    const result = runNode([join(scriptsDir, "release-tag.mjs"), "v3.13.1"])
    assert.equal(result.status, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /::error::v3\.13\.1 is not a 4\.x version/)
  })
})

describe("release.js", () => {
  function repo() {
    const root = mkdtempSync(join(tmpdir(), "release-js-"))
    temps.push(root)
    cpSync(scriptsDir, join(root, "scripts"), { recursive: true })
    for (const pkg of ["core", "react", "vite-plugin"]) {
      mkdirSync(join(root, "packages", pkg), { recursive: true })
      writeFileSync(
        join(root, "packages", pkg, "package.json"),
        JSON.stringify({ name: `@ic-reactor/${pkg}`, version: "4.0.0-beta.2" })
      )
    }
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "ic-reactor", version: "4.0.0-beta.2" })
    )
    return root
  }

  for (const version of ["3.13.1", "5.0.0", "4.0", "4.0.0+build.1"]) {
    it(`refuses ${version} before it rewrites a manifest`, () => {
      const root = repo()
      const result = runNode(
        [join(root, "scripts", "release.js"), version],
        root
      )
      assert.equal(result.status, 1)
      assert.match(
        result.stderr,
        new RegExp(`Refusing ${version.replace(/[.+]/g, "\\$&")}: `)
      )
      for (const pkg of ["core", "react", "vite-plugin"]) {
        const manifest = JSON.parse(
          readFileSync(join(root, "packages", pkg, "package.json"), "utf8")
        )
        assert.equal(manifest.version, "4.0.0-beta.2")
      }
    })
  }
})
