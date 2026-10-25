#!/usr/bin/env node
/**
 * What a release of this line publishes, from its version or its tag.
 *
 * `main` releases `@ic-reactor/core`, `@ic-reactor/react` and
 * `@ic-reactor/vite-plugin` in lockstep, at 4.x only: the 3.x line has its own
 * lane on the `v3` branch. A stable version goes to npm's `latest` dist-tag and
 * becomes the repository's latest GitHub Release; a prerelease goes to `beta`
 * and never to `latest`. Anything else is refused, so a 3.x or 5.x tag pushed
 * here publishes nothing.
 *
 * `.github/workflows/release.yml` runs this as a command on the tag, and
 * `scripts/release.js` imports it, so the two cannot disagree about a version.
 *
 * Usage: node scripts/release-tag.mjs v4.0.0
 * Prints `version=`, `dist_tag=`, `prerelease=` and `make_latest=` lines (the
 * `$GITHUB_OUTPUT` format), or exits 1 with the reason on stderr.
 */
import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

/** The only major this line releases. */
export const RELEASE_MAJOR = 4

// No build metadata: npm drops `+build` from the version it publishes, so the
// tag, the manifests and the registry would disagree.
const VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/

/**
 * @param {string} versionOrTag `4.0.0`, `v4.0.0-beta.2`, ...
 * @returns {{ version: string, prerelease: boolean, distTag: "latest" | "beta", makeLatest: boolean }}
 * @throws {Error} for anything that is not a 4.x semver version
 */
export function releaseFor(versionOrTag) {
  const version = String(versionOrTag ?? "").replace(/^v/, "")
  const match = VERSION.exec(version)
  if (!match) {
    throw new Error(
      `${versionOrTag} is not a release version (MAJOR.MINOR.PATCH, with an optional -prerelease and no +build).`
    )
  }
  if (Number(match[1]) !== RELEASE_MAJOR) {
    throw new Error(
      `${versionOrTag} is not a ${RELEASE_MAJOR}.x version. This lane releases ${RELEASE_MAJOR}.x only; 3.x security releases are tagged from the v3 branch with its own workflows.`
    )
  }
  const prerelease = match[4] !== undefined
  return {
    version,
    prerelease,
    distTag: prerelease ? "beta" : "latest",
    makeLatest: !prerelease,
  }
}

function isMain() {
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    )
  } catch {
    return false
  }
}

if (isMain()) {
  try {
    const release = releaseFor(process.argv[2])
    console.log(`version=${release.version}`)
    console.log(`dist_tag=${release.distTag}`)
    console.log(`prerelease=${release.prerelease}`)
    console.log(`make_latest=${release.makeLatest}`)
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exit(1)
  }
}
