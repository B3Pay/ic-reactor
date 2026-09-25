# IC Reactor Packages Skill

AI agent skill for reasoning about the IC Reactor monorepo package layout,
public package boundaries, generated artifacts, and verification workflow.

## What This Skill Covers

- Which package owns a behavior or public API
- Package exports, `src/index.ts`, `package.json`, and peer dependency checks
- Root `tsconfig.json` project references and CI-aligned type checks
- Generated file boundaries for codegen, CLI, Vite plugin, parser, and examples
- Focused verification commands for package-level changes
- Cross-doc consistency for README files, docs pages, agent files, and `llms.txt`

## Skill Structure

```text
ic-reactor-packages/
  SKILL.md                     # Main package routing and workflow
  README.md                    # This file
  references/
    package-map.md             # Detailed package ownership and verification matrix
  agents/
    openai.yaml                # OpenAI / Codex agent metadata
    claude.yaml                # Claude / Anthropic agent metadata
    copilot.yaml               # GitHub Copilot agent metadata
  assets/
    ic-reactor-icon.svg        # Skill icon
```

## Example Prompt

```text
Use $ic-reactor-packages to review this package-level change and tell me which
packages need tests, builds, docs, or export updates.
```

## Companion References

- Root `AGENTS.md` for task-to-source routing, verification by change type,
  and the rules for the AI context files
- Root `llms.txt`, `llms-full.txt` and `packages/*/llms.txt`, the consumer
  guides that ship with the docs and the npm packages
- `skill-packages/ic-reactor/`, the consumer skill, which apps install as a
  Claude Code plugin (`.claude-plugin/marketplace.json`) or with the `skills`
  CLI
- `CLAUDE.md`, `.github/copilot-instructions.md`, and `.cursorrules` for
  agent-specific discovery
