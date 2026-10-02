// What setup.mjs refuses to ship for the v4 condition, whose packages are
// packed from this repository rather than taken from npm: a guide that gives
// the hidden tests away, or package code that names one. Shared by setup.mjs
// (which refuses the tree) and harness/ship.test.mjs (which checks the
// refusal on seeded files and the tree setup built).
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { checkDocs, hiddenTestNames as testNamesOf } from "./check-docs.mjs"

/** The packages the v4 condition installs from tarballs packed in this repository. */
export const V4_PACKAGES = ["@ic-reactor/core", "@ic-reactor/react"]

/** What a shipped v4 package keeps: what a built package needs at run time. */
export const V4_PACKAGE_ENTRIES = ["dist", "package.json"]

/**
 * The packages whose classes cross between the hidden tests' world (which
 * imports them from evals' own install) and a v4 solution: in the scorer's
 * install (conditions/v4/node_modules) each is a link to evals' copy, so
 * both sides load one instance of it, as they do in every other condition.
 */
export const V4_SHARED_WITH_WORLD = ["@icp-sdk/core"]

/**
 * Every hidden-test name (harness/check-docs.mjs), as written and with
 * spaces for underscores, lower-cased. Only names: the distinctive literals
 * check-docs also looks for in a guide (amounts, `HTTP 429`, runs of zeros)
 * occur legitimately in a library that parses amounts and classifies HTTP
 * statuses.
 */
export function hiddenTestNames() {
  return [...new Set(testNamesOf().map(({ needle }) => needle.toLowerCase()))]
}

const CODE_FILE = /\.(js|cjs|mjs|ts|cts|mts|map|json)$/

/**
 * The hidden-test names found in the code files (JavaScript, declarations,
 * source maps, JSON) under `root`, as `{ file, needle }` with `file` relative
 * to `root`.
 */
export function namedInCode(root, names = hiddenTestNames()) {
  const hits = []
  for (const file of readdirSync(root, { recursive: true })) {
    if (!CODE_FILE.test(file)) continue
    const text = readFileSync(join(root, file), "utf8").toLowerCase()
    for (const needle of names) {
      if (text.includes(needle)) hits.push({ file, needle })
    }
  }
  return hits
}

/**
 * Why a freshly installed v4 ship tree (`<dir>/node_modules`, before its
 * packages are cut to {@link V4_PACKAGE_ENTRIES}) must be refused: the core
 * tarball's llms.txt, the condition's only guide, holds a hidden-test name
 * or distinctive literal (harness/check-docs.mjs), or a package's code names
 * a hidden test. One line per finding; empty when the tree may ship.
 */
export function v4ShipFindings(dir) {
  const modules = join(dir, "node_modules")
  const guide = join(modules, "@ic-reactor", "core", "llms.txt")
  const findings = checkDocs([guide]).hits.map(
    (hit) => `guide ${hit.file}: ${JSON.stringify(hit.needle)} from ${hit.from}`
  )
  const names = hiddenTestNames()
  for (const name of V4_PACKAGES) {
    for (const hit of namedInCode(join(modules, name), names)) {
      findings.push(`code ${name}/${hit.file}: ${JSON.stringify(hit.needle)}`)
    }
  }
  return findings
}
