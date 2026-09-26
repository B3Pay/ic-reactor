# `ic-reactor` Agent Skill

An [Agent Skill](https://agentskills.io) for coding agents that write, review
or fix app code built on IC Reactor (`@ic-reactor/react`, `@ic-reactor/core`,
`@ic-reactor/candid`, `@ic-reactor/vite-plugin`, `@ic-reactor/cli`). It tells
the agent which setup fits the app, which API to reach for inside and outside
React, how to render on a server, sign in, handle errors, show token amounts
and test, and which mistakes to avoid. It points the agent at the
`llms.txt` each installed package ships, so the guidance follows the version
the app has installed.

## Install

### Claude Code

This repository is a Claude Code plugin marketplace. In a session:

```text
/plugin marketplace add B3Pay/ic-reactor
/plugin install ic-reactor@ic-reactor
```

Or from a shell: `claude plugin marketplace add B3Pay/ic-reactor`, then
`claude plugin install ic-reactor@ic-reactor`. The plugin's `version` follows
`@ic-reactor/react`, so an installed copy changes when a release bumps it:
turn on auto-update for the marketplace in `/plugin` (**Marketplaces** tab),
or run `claude plugin update ic-reactor@ic-reactor`.

### Other agents (Codex, Cursor, Copilot, Gemini CLI, OpenCode, ...)

With the [`skills`](https://github.com/vercel-labs/skills) CLI, from the
app's root:

```bash
npx skills add B3Pay/ic-reactor --skill ic-reactor
```

It copies this folder into each selected agent's skills directory (for
example `.claude/skills/ic-reactor/` or `.agents/skills/ic-reactor/`). To
install it by hand, copy this folder there yourself. Only the `ic-reactor`
skill is meant for apps; the other skills in `skill-packages/` are for work on
this repository.

### Agents without skill support

Add the snippet from
[AI Friendliness](https://ic-reactor.b3pay.net/v3/guides/ai-friendliness) to
the app's `AGENTS.md` or rules file instead.

## Contents

| Path                                  | What it holds                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `SKILL.md`                            | When to use the skill, the workflow, the setup choices, the rules and the list of don'ts  |
| `references/setup.md`                 | `defineReactor`, a second canister, a manual setup, the Vite plugin and CLI configuration |
| `references/queries-and-mutations.md` | Hooks, query and mutation objects, pagination, optimistic updates, `forCanister`, tokens  |
| `references/server-rendering.md`      | `createReactorProvider` and React Server Components                                       |
| `references/auth-errors-testing.md`   | Internet Identity, errors and retries, tests against the fake replica                     |
| `.claude-plugin/plugin.json`          | The Claude Code plugin manifest; the plugin is this folder, with `SKILL.md` at its root   |

## Maintaining

This folder is the only copy: the Claude Code plugin and the `skills` CLI both
install it from here. Keep it to the public API of the published packages,
the docs site and `node_modules/@ic-reactor/*/llms.txt`, never repository
paths. `pnpm check:ai-context` validates the frontmatter, the version list,
the plugin manifest and the docs links, and the release scripts bump the
versions in it.
