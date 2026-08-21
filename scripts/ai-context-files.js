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
  "skill-packages/ic-reactor-hooks/SKILL.md",
  "skill-packages/ic-reactor-packages/SKILL.md",
  "skill-packages/ic-reactor-packages/references/package-map.md",
  "packages/core/llms.txt",
  "packages/react/llms.txt",
  "packages/candid/llms.txt",
  "packages/codegen/llms.txt",
  "packages/cli/llms.txt",
  "packages/vite-plugin/llms.txt",
]
