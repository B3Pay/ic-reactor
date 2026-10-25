/**
 * Tests of `.github/workflows/release.yml`'s publish step, read as text: the
 * repository root has no YAML parser of its own.
 *
 * npm takes `npm publish <spec>` as a package spec. A spec shaped `a/b` is a
 * GitHub shorthand to npm before it is a file, so a relative tarball path must
 * start with `./` (or be absolute) to be read as the file. The first
 * 4.0.0-beta.8 run passed `tarballs/<name>.tgz` and npm tried to clone
 * github.com/tarballs/<name>.tgz.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const workflow = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    ".github",
    "workflows",
    "release.yml"
  ),
  "utf8"
)

/** The text of one job under `jobs:`, up to the next job. */
function job(name) {
  const match = workflow.match(
    new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:\\n|(?![\\s\\S]))`, "m")
  )
  assert.ok(match, `release.yml has a ${name} job`)
  return match[1]
}

describe("release.yml's publish step", () => {
  it("publishes the tarball by a path npm reads as a file", () => {
    const publish = job("publish")
    const assignments = [...publish.matchAll(/^\s*TARBALL="([^"]+)"$/gm)]
    assert.equal(assignments.length, 1, publish)
    assert.match(assignments[0][1], /^(\.\.?\/|\/)/)
    assert.equal(publish.match(/^\s*npm publish "\$TARBALL" /gm)?.length, 1)
  })
})
