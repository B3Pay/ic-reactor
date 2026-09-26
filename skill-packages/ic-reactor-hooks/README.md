# IC Reactor Hooks Skill

AI agent skill for building and refactoring `@ic-reactor/react` integrations in Internet Computer (ICP) projects.

## What This Skill Covers

- `defineReactor(...)` / `defineDisplayReactor(...)` — one-call `QueryClient` + `ClientManager` + reactor + hooks setup (`Reactor` or `DisplayReactor`)
- `createReactorProvider(...)` — per-request setup for server-rendered apps
- `createActorHooks(...)` — typed hook suite for a canister
- `createQuery` / `createMutation` factory patterns — reusable inside and outside React
- `createQueryFactory` / `createSuspenseQueryFactory` — cached operation factories for dynamic args
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

| Agent Platform     | Config File           | Discovery Method                            |
| ------------------ | --------------------- | ------------------------------------------- |
| OpenAI Codex       | `agents/openai.yaml`  | `AGENTS.md` + `.codex/` path conventions    |
| Claude / Anthropic | `agents/claude.yaml`  | `CLAUDE.md` + skill-packages discovery      |
| GitHub Copilot     | `agents/copilot.yaml` | `.github/copilot-instructions.md` reference |
| Cursor             | —                     | `.cursorrules` references `SKILL.md`        |

All agents share the same `SKILL.md` instructions and `references/patterns.md` examples.

## How to Use

### In-Repo (Automatic)

Agents working in the `ic-reactor` repository discover this skill through:

- `AGENTS.md` (OpenAI Codex)
- `CLAUDE.md` (Claude)
- `.github/copilot-instructions.md` (GitHub Copilot)
- `.cursorrules` (Cursor)

### In an App (not this repository)

This skill is written for work on IC Reactor itself and points at files in
this repository. For an app that installs the packages, use the consumer
skill, [`ic-reactor`](../ic-reactor/), instead. In Claude Code:

```text
/plugin marketplace add B3Pay/ic-reactor
/plugin install ic-reactor@ic-reactor
```

With the `skills` CLI (Codex, Cursor, Copilot and other agents):

```bash
npx skills add B3Pay/ic-reactor --skill ic-reactor
```

Use `llms-full.txt` alongside this skill for the complete consumer API guide
(install commands, auth, errors), and `AGENTS.md` for the package map and what
to run for each kind of change.

#### Dependency note

`@ic-reactor/react` supports `@icp-sdk/auth` v10 and v8 for Internet Identity.
Install v10, the first release that peers `@icp-sdk/core@^6`, which IC Reactor
needs, so npm installs the set without help. v7 and v9 are not supported. Every
v8 release peers `@icp-sdk/core@^5`, so a strict `npm install` of v8 fails with
`ERESOLVE`. That metadata is stale upstream, not an actual incompatibility, so on
v8 point auth at your own `core` with a scoped override:

```json
{
  "overrides": {
    "@icp-sdk/auth": {
      "@icp-sdk/core": "$@icp-sdk/core"
    }
  }
}
```

pnpm and yarn install the same set without complaint.

### Example Prompt

```text
Use $ic-reactor-hooks to build a reusable query/mutation factory pair for my
canister and show usage inside a React component and in a route loader.
```

## License

MIT (skill content). IC Reactor logo/icon remains subject to the IC Reactor project licensing and branding terms.
