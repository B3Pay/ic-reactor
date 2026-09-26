import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  AI_CONTEXT_FILES,
  RUNTIME_PLUGIN_MANIFESTS,
} from "./ai-context-files.js"

/**
 * Rewrite version references belonging to the packages being released.
 *
 * The lanes version independently — runtime is 3.x, tooling 0.12.x, parser
 * 0.4.x — so a blind textual replacement of the outgoing version is unsafe: if
 * two lanes ever share a version string, releasing one would silently rewrite
 * the other's documented version, and `check-ai-context.js` would not catch it
 * because it accepts any version belonging to any @ic-reactor package.
 *
 * So a replacement happens only on a line that also names one of the packages
 * being released. Every real occurrence is of that shape — the package tables
 * in AGENTS.md/CLAUDE.md, the lane lines in .cursorrules and
 * skill-packages/README.md, the version table in llms.txt. A version mention
 * that names no package is left alone, which surfaces as a loud
 * `check:ai-context` failure on the release commit rather than as a silent
 * cross-lane rewrite.
 *
 * @param {string} rootDir       repository root
 * @param {string} oldVersion    version being replaced
 * @param {string} newVersion    version to write
 * @param {string[]} packageNames  the `@ic-reactor/*` packages this release covers
 * @returns {string[]} relative paths that changed
 */
export function syncAiContextVersions(
  rootDir,
  oldVersion,
  newVersion,
  packageNames
) {
  if (oldVersion === newVersion) return []

  // Same boundaries as check-ai-context.js's SEMVER, so `0.12.0` inside
  // `0.12.01` or a longer dotted string is not touched. Matches an optional
  // leading `v`.
  const escaped = oldVersion.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
  const pattern = new RegExp(`(?<![\\d.])(v?)${escaped}(?![\\d.]\\d)`, "g")

  // A line qualifies if it names one of the released packages, either in full
  // (`@ic-reactor/codegen`) or as its directory (`packages/codegen`).
  const needles = packageNames.flatMap((name) => {
    const dir = name.replace("@ic-reactor/", "")
    return [name, `packages/${dir}`]
  })

  const changed = []

  for (const relativePath of AI_CONTEXT_FILES) {
    const fullPath = join(rootDir, relativePath)
    let text
    try {
      text = readFileSync(fullPath, "utf-8")
    } catch {
      continue // optional file
    }

    const updated = text
      .split("\n")
      .map((line) => {
        if (!needles.some((needle) => line.includes(needle))) return line
        return line.replace(pattern, `$1${newVersion}`)
      })
      .join("\n")

    if (updated !== text) {
      writeFileSync(fullPath, updated, "utf-8")
      changed.push(relativePath)
    }
  }

  return changed
}

/**
 * Set the `version` of each Claude Code plugin manifest that follows the
 * runtime lane (`RUNTIME_PLUGIN_MANIFESTS`) to the released version.
 *
 * A manifest's `"version": "x.y.z"` line names no package, so
 * `syncAiContextVersions` leaves it alone. The file is rewritten the way
 * `release.js` rewrites a `package.json`: parsed, updated and written back
 * with two-space indentation, which is also how Prettier formats it.
 *
 * @param {string} rootDir     repository root
 * @param {string} newVersion  the runtime version being released
 * @returns {string[]} relative paths that changed
 */
export function syncPluginManifestVersions(rootDir, newVersion) {
  const changed = []
  for (const relativePath of RUNTIME_PLUGIN_MANIFESTS) {
    const fullPath = join(rootDir, relativePath)
    const text = readFileSync(fullPath, "utf-8")
    const manifest = JSON.parse(text)
    if (manifest.version === newVersion) continue
    manifest.version = newVersion
    writeFileSync(fullPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8")
    changed.push(relativePath)
  }
  return changed
}
