/**
 * The single list of files whose version references must stay current.
 *
 * `check-ai-context.js` validates these; `release.js` and `release-tools.js`
 * rewrite them. Keeping the list in one module is the point: when the two
 * release scripts each carried their own copy, the tools lane's copy omitted
 * the runtime `llms.txt` files and the runtime lane's omitted the tooling ones,
 * so either lane could leave a stale mention that the checker then failed on.
 */
export const AI_CONTEXT_FILES = [
  "llms.txt",
  "llms-full.txt",
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
  "skill-packages/README.md",
  "skill-packages/ic-reactor/SKILL.md",
  "skill-packages/ic-reactor/README.md",
  "skill-packages/ic-reactor/references/setup.md",
  "skill-packages/ic-reactor/references/queries-and-mutations.md",
  "skill-packages/ic-reactor/references/server-rendering.md",
  "skill-packages/ic-reactor/references/auth-errors-testing.md",
  "skill-packages/ic-reactor-hooks/SKILL.md",
  "skill-packages/ic-reactor-hooks/references/patterns.md",
  "skill-packages/ic-reactor-packages/SKILL.md",
  "skill-packages/ic-reactor-packages/references/package-map.md",
  "packages/core/llms.txt",
  "packages/react/llms.txt",
  "packages/candid/llms.txt",
  "packages/codegen/llms.txt",
  "packages/cli/llms.txt",
  "packages/vite-plugin/llms.txt",
  "packages/parser/llms.txt",
]

/**
 * The Claude Code plugin marketplace at the repository root. Each plugin it
 * lists is a directory in this repository holding `.claude-plugin/plugin.json`
 * and the skill it installs.
 */
export const CLAUDE_MARKETPLACE = ".claude-plugin/marketplace.json"

/**
 * Plugin manifests whose `version` is the runtime lane's version
 * (`@ic-reactor/core`, `@ic-reactor/react`, `@ic-reactor/candid`).
 *
 * A JSON `"version"` line names no package, so the line-based sweep in
 * `sync-ai-context-versions.js` cannot rewrite it; `release.js` sets these
 * with `syncPluginManifestVersions` instead, and `check-ai-context.js` fails
 * when one differs from `@ic-reactor/react`. Claude Code installs a new copy
 * of a plugin only when this version changes, so a stale one would keep users
 * on the previous release's skill.
 */
export const RUNTIME_PLUGIN_MANIFESTS = [
  "skill-packages/ic-reactor/.claude-plugin/plugin.json",
]
