/**
 * The single list of files whose version references must stay current.
 *
 * `check-ai-context.js` validates these and `release.js` rewrites them, so the
 * two cannot disagree about which files a release has to update.
 *
 * On the v4 line there is one consumer guide, `packages/core/llms.txt`
 * (shipped in core's tarball), plus the two contributor files. The skill the
 * DX3 slice adds joins this list with its `SKILL.md` and references.
 */
export const AI_CONTEXT_FILES = [
  "packages/core/llms.txt",
  "AGENTS.md",
  "CLAUDE.md",
]

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
