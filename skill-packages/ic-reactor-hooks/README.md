# IC Reactor Hooks Skill

AI agent skill for building and refactoring `@ic-reactor/react` integrations in Internet Computer (ICP) projects.

## What This Skill Covers

- `createActorHooks(...)` — typed hook suite for a canister
- `createQuery` / `createMutation` factory patterns — reusable inside and outside React
- `useActorMethod` — unified query/update hook
- TanStack Query cache invalidation patterns
- Generated hooks from `@ic-reactor/cli` and `@ic-reactor/vite-plugin`
- Correct usage inside React components vs imperative usage outside React

## Skill Structure

```
ic-reactor-hooks/
  SKILL.md                     # Main skill instructions and workflow
  README.md                    # This file
  references/
    patterns.md                # Concrete code patterns and API reference
  agents/
    openai.yaml                # OpenAI / Codex agent metadata
    claude.yaml                # Claude / Anthropic agent metadata
    copilot.yaml               # GitHub Copilot agent metadata
  assets/
    ic-reactor-icon.svg        # Skill icon
```

## Multi-Agent Support

This skill package includes metadata for multiple AI agent platforms:

| Agent Platform     | Config File            | Discovery Method                            |
| ------------------ | ---------------------- | ------------------------------------------- |
| OpenAI Codex       | `agents/openai.yaml`   | `AGENTS.md` + `.codex/` path conventions    |
| Claude / Anthropic | `agents/claude.yaml`   | `CLAUDE.md` + skill-packages discovery      |
| GitHub Copilot     | `agents/copilot.yaml`  | `.github/copilot-instructions.md` reference |
| Cursor             | —                      | `.cursorrules` references `SKILL.md`        |

All agents share the same `SKILL.md` instructions and `references/patterns.md` examples.

## How to Use

### In-Repo (Automatic)

Agents working in the `ic-reactor` repository discover this skill through:

- `AGENTS.md` (OpenAI Codex)
- `CLAUDE.md` (Claude)
- `.github/copilot-instructions.md` (GitHub Copilot)
- `.cursorrules` (Cursor)

### Install from GitHub

```text
Install the skill from github.com/B3Pay/ic-reactor path skill-packages/ic-reactor-hooks
```

### Example Prompt

```text
Use $ic-reactor-hooks to build a reusable query/mutation factory pair for my
canister and show usage inside a React component and in a route loader.
```

## License

MIT (skill content). IC Reactor logo/icon remains subject to the IC Reactor project licensing and branding terms.
