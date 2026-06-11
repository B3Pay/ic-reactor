# Skill Packages

This directory contains AI agent skill packages for the IC Reactor project. Skills provide structured instructions that help AI coding agents generate correct, idiomatic IC Reactor code.

## Available Skills

| Skill                                           | Description                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`ic-reactor-hooks`](./ic-reactor-hooks/)       | React hooks, query/mutation factories, generated hooks, cache patterns, and inside/outside React usage |
| [`ic-reactor-packages`](./ic-reactor-packages/) | Monorepo package ownership, generated artifacts, documentation consistency, and verification workflow  |

Use root `llms.txt` for compact repository routing and `llms-full.txt` when an
agent needs a longer prompt-ready IC Reactor API guide. Skills should stay
focused on workflow and link to `references/` for concrete examples.

## Agent Compatibility

Each skill includes metadata for multiple AI agent platforms:

- **OpenAI Codex** — `agents/openai.yaml`
- **Claude / Anthropic** — `agents/claude.yaml`
- **GitHub Copilot** — `agents/copilot.yaml`
- **Cursor / Windsurf / other** — via `.cursorrules` and shared `SKILL.md`

## How Skills Are Discovered

| Agent              | Discovery File                    | Skill Path Reference                   |
| ------------------ | --------------------------------- | -------------------------------------- |
| OpenAI Codex       | `AGENTS.md`                       | `skill-packages/<skill-name>/SKILL.md` |
| Claude / Anthropic | `CLAUDE.md`                       | `skill-packages/<skill-name>/SKILL.md` |
| GitHub Copilot     | `.github/copilot-instructions.md` | `skill-packages/<skill-name>/SKILL.md` |
| Cursor             | `.cursorrules`                    | `skill-packages/<skill-name>/SKILL.md` |

## Adding a New Skill

1. Create a new directory under `skill-packages/` with the skill name.
2. Add a `SKILL.md` with YAML frontmatter (`name`, `description`) and workflow instructions.
3. Add a `references/` directory for concrete code examples and API details.
4. Add agent metadata files in `agents/` (at minimum `openai.yaml` and `claude.yaml`).
5. Register the skill in `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`.
