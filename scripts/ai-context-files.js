import { existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The single list of files whose version references must stay current.
 *
 * `check-ai-context.js` validates these and `release.js` rewrites them, so the
 * two cannot disagree about which files a release has to update.
 *
 * On the v4 line the list is short on purpose: the one consumer guide,
 * `packages/core/llms.txt` (shipped in core's tarball), the two contributor
 * files, and what the DX3 slice adds when it lands: a pointer `llms.txt` in
 * `packages/react` and the one consumer skill,
 * `skill-packages/ic-reactor/SKILL.md` with its `references/`. Those are listed
 * when they exist, so the check covers them from the commit that adds them,
 * with no second edit here to forget. The three files below are required: a
 * rename or a deletion fails `check-ai-context.js` with "Missing AI-context
 * file".
 */
const REQUIRED = ["packages/core/llms.txt", "AGENTS.md", "CLAUDE.md"]

/** Listed when present. */
const OPTIONAL = [
  "packages/react/llms.txt",
  "skill-packages/ic-reactor/SKILL.md",
]

/** The consumer skill's folder: its references are AI context too. */
const SKILL_REFERENCES = "skill-packages/ic-reactor/references"

/**
 * The AI-context files of the tree at `rootDir`.
 *
 * @param {string} rootDir the repository root
 * @returns {string[]} paths relative to `rootDir`, in a fixed order
 */
export function aiContextFilesAt(rootDir) {
  const references = existsSync(join(rootDir, SKILL_REFERENCES))
    ? readdirSync(join(rootDir, SKILL_REFERENCES))
        .filter((name) => name.endsWith(".md"))
        .sort()
        .map((name) => `${SKILL_REFERENCES}/${name}`)
    : []
  return [
    ...REQUIRED,
    ...OPTIONAL.filter((file) => existsSync(join(rootDir, file))),
    ...references,
  ]
}

export const AI_CONTEXT_FILES = aiContextFilesAt(
  join(dirname(fileURLToPath(import.meta.url)), "..")
)

/**
 * The Claude Code plugin marketplace at the repository root. Each plugin it
 * lists is a directory in this repository holding `.claude-plugin/plugin.json`
 * and the skill it installs. Optional: the v4 line has none until DX3.
 */
export const CLAUDE_MARKETPLACE = ".claude-plugin/marketplace.json"

/**
 * Plugin manifests whose `version` is the release lane's version.
 *
 * A JSON `"version"` line names no package, so the line-based sweep in
 * `sync-ai-context-versions.js` cannot rewrite it; `release.js` sets these
 * with `syncPluginManifestVersions` instead, and `check-ai-context.js` fails
 * when one differs from `@ic-reactor/react`. Claude Code installs a new copy
 * of a plugin only when this version changes. Empty until DX3 adds the skill.
 */
export const RUNTIME_PLUGIN_MANIFESTS = []
