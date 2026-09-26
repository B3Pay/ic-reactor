# Skill Packages

This directory contains AI agent skill packages for the IC Reactor v3 project. Skills provide structured instructions that help AI coding agents generate correct, idiomatic IC Reactor code.

## Repository Package Surface

- This branch is the stable v3 release line and should be described as IC Reactor v3.
- Runtime packages: `@ic-reactor/core`, `@ic-reactor/react`, and `@ic-reactor/candid` (`3.13.0`).
- Code generation packages: `@ic-reactor/codegen`, `@ic-reactor/cli`, and `@ic-reactor/vite-plugin` (`0.15.0`).
- Parser package: `@ic-reactor/parser` (`0.6.0`).
- Consumer AI guides: [`../llms.txt`](../llms.txt) (index) and [`../llms-full.txt`](../llms-full.txt) (complete guide); contributor routing: [`../AGENTS.md`](../AGENTS.md).

## Available Skills

For apps that install the packages:

| Skill                         | Description                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`ic-reactor`](./ic-reactor/) | Consumer skill: setup choices, queries and mutations, cache invalidation, SSR, sign-in, errors, token amounts, testing, don'ts |

For contributors working in this repository:

| Skill                                           | Description                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`ic-reactor-hooks`](./ic-reactor-hooks/)       | React hooks, query/mutation factories, generated hooks, cache patterns, and inside/outside React usage |
| [`ic-reactor-packages`](./ic-reactor-packages/) | Monorepo package ownership, generated artifacts, documentation consistency, and verification workflow  |

Use root `AGENTS.md` for repository routing and verification, and
`llms-full.txt` when an agent needs the complete consumer API guide. Skills should stay
focused on workflow and link to `references/` for concrete examples.

## Installing the Consumer Skill in an App

`ic-reactor/` is also a Claude Code plugin (`ic-reactor/.claude-plugin/plugin.json`),
listed by the marketplace at the repository root (`.claude-plugin/marketplace.json`):

```text
/plugin marketplace add B3Pay/ic-reactor
/plugin install ic-reactor@ic-reactor
```

Other agents install the same folder with the `skills` CLI:

```bash
npx skills add B3Pay/ic-reactor --skill ic-reactor
```

The folder is the only copy of the skill. It refers only to the published
packages' public API, the docs site and `node_modules/@ic-reactor/*/llms.txt`,
never to paths in this repository. `pnpm check:ai-context` checks its
frontmatter, version list, plugin manifest and links, and `scripts/release.js`
bumps the plugin's `version` with `@ic-reactor/react`.

## Agent Compatibility

Each contributor skill includes metadata for multiple AI agent platforms:

- **OpenAI Codex** — `agents/openai.yaml`
- **Claude / Anthropic** — `agents/claude.yaml`
- **GitHub Copilot** — `agents/copilot.yaml`
- **Cursor / Windsurf / other** — via `.cursorrules` and shared `SKILL.md`

## How Contributor Skills Are Discovered in This Repository

| Agent              | Discovery File                    | Skill Path Reference                   |
| ------------------ | --------------------------------- | -------------------------------------- |
| OpenAI Codex       | `AGENTS.md`                       | `skill-packages/<skill-name>/SKILL.md` |
| Claude / Anthropic | `CLAUDE.md`                       | `skill-packages/<skill-name>/SKILL.md` |
| GitHub Copilot     | `.github/copilot-instructions.md` | `skill-packages/<skill-name>/SKILL.md` |
| Cursor             | `.cursorrules`                    | `skill-packages/<skill-name>/SKILL.md` |

## Adding a New Skill

1. Create a new directory under `skill-packages/` with the skill name.
2. Add a `SKILL.md` with YAML frontmatter (`name` matching the directory, `description` of at most 1024 characters) and workflow instructions.
3. Add a `references/` directory for concrete code examples and API details.
4. Add agent metadata files in `agents/` (at minimum `openai.yaml` and `claude.yaml`).
5. Register the skill in `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`.
