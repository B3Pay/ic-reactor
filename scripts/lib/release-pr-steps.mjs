/**
 * What `release.js` prints once it has made the release commit: the rest of a
 * release, which goes through a pull request. A release reaches npm only
 * through `release.yml`, from a tag on that pull request's merge commit, so
 * the script itself never pushes, tags or publishes (#969).
 */

import { releaseFor } from "../release-tag.mjs"

/** A new pull request against `main`, the 4.x line and the default branch. */
const COMPARE_WITH_MAIN = "https://github.com/B3Pay/ic-reactor/compare/main..."

/**
 * The steps left after the release commit of `version`, as lines to print.
 *
 * @param {string} version  the version the release commit sets, such as `4.0.0`
 * @returns {string}
 */
export function releasePrSteps(version) {
  const { distTag } = releaseFor(version)
  const branch = `release/v${version}`
  const tag = `v${version}`
  // GitHub's merge commit names the branch it merged: "Merge pull request #N
  // from B3Pay/release/v<version>". A version's dots must match only dots.
  const mergedFrom = `from B3Pay/${branch.replaceAll(".", "\\.")}$`
  return [
    `Nothing is pushed, tagged or published. Release ${tag} through a pull request:`,
    "",
    `  1. Move the entries under "## Unreleased" in CHANGELOG.md into a new`,
    `     "## core, react, vite-plugin ${version}" section below it, and commit that.`,
    `  2. Push the commits as ${branch}, and open its pull request into main:`,
    `       git push origin HEAD:refs/heads/${branch}`,
    `       ${COMPARE_WITH_MAIN}${branch}?expand=1`,
    `  3. Once it is merged, find its merge commit, then tag that commit and push`,
    `     that one tag (if the log prints nothing, take the commit from the pull`,
    `     request's page):`,
    `       git fetch origin main`,
    `       git log origin/main --first-parent --merges -1 --format='%H %s' --grep='${mergedFrom}'`,
    `       git tag -a ${tag} -m "ic-reactor ${version}" <merge-commit>`,
    `       git push origin ${tag}`,
    `     release.yml checks the tag, waits for approval on npm-publish, and`,
    `     publishes core, react and vite-plugin under the ${distTag} dist-tag.`,
  ].join("\n")
}
