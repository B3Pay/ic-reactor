/**
 * Tests of what `.github/workflows/release.yml` hands to npm, which no
 * workflow run checks before a release: the publish job runs only from a tag,
 * after the npm-publish approval.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { LANE_PACKAGES } from "./release-tag.mjs"

const workflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8"
)

/** Each `npm publish` argument, with a `"$VAR"` resolved to its assignments. */
function publishedPaths(text) {
  const paths = []
  for (const [, arg] of text.matchAll(/\bnpm publish\s+(\S+)/g)) {
    const variable = /^"?\$\{?(\w+)\}?"?$/.exec(arg)?.[1]
    if (variable === undefined) {
      paths.push(arg.replace(/^"|"$/g, ""))
      continue
    }
    const assigned = [
      ...text.matchAll(new RegExp(`\\b${variable}="([^"]*)"`, "g")),
    ].map((match) => match[1])
    assert.ok(assigned.length > 0, `npm publish names $${variable}, never set`)
    paths.push(...assigned)
  }
  return paths
}

describe("release.yml's npm publish", () => {
  it("publishes at least one tarball", () => {
    assert.ok(publishedPaths(workflow).length > 0)
  })

  // npm reads `dir/file.tgz` as the GitHub repository `dir/file.tgz`, and
  // the 4.0.0-beta.8 run failed on git ls-remote with nothing published. A
  // path npm reads as a file starts with ./, ../ or /.
  it("names every tarball by a path npm reads as a file", () => {
    for (const path of publishedPaths(workflow)) {
      assert.match(path, /^(?:\.\.?\/|\/)/, `${path} would be read as git`)
    }
  })

  it("tells a repository shorthand from a file path", () => {
    assert.deepEqual(
      publishedPaths('T="tarballs/a.tgz"\nnpm publish "$T" --tag beta'),
      ["tarballs/a.tgz"]
    )
    assert.deepEqual(publishedPaths("npm publish ./a.tgz"), ["./a.tgz"])
  })
})

/**
 * The words of each shell loop of `text` that runs over the packages: a
 * `for <variable> in <words>; do` whose words name core, as `core` or
 * `packages/core`.
 */
function packageLoops(text) {
  return [...text.matchAll(/\bfor \w+ in ([^;\n]+); do/g)]
    .map(([, words]) => words.trim().split(/\s+/))
    .filter((words) => words.some((word) => /^(?:packages\/)?core$/.test(word)))
}

describe("release.yml's packages", () => {
  // The publish job checks nothing out, so the workflow cannot read the lane
  // from scripts/release-tag.mjs: it names the packages in four loops, and a
  // package left out of one would be bumped by release.js and then never
  // checked, packed or published.
  it("names the lane of release-tag.mjs, in its order, in each of its four loops", () => {
    const loops = packageLoops(workflow)
    assert.equal(
      loops.length,
      4,
      `loops over the packages: ${JSON.stringify(loops)}`
    )
    for (const words of loops) {
      assert.deepEqual(
        words.map((word) => word.replace(/^packages\//, "")),
        [...LANE_PACKAGES]
      )
    }
  })

  it("finds a loop over the packages, and only such a loop", () => {
    assert.deepEqual(
      packageLoops(
        "for workflow in ci.yml e2e.yml; do\nfor pkg in packages/core packages/react; do\nfor name in core; do"
      ),
      [["packages/core", "packages/react"], ["core"]]
    )
  })
})
