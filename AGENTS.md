# AGENTS.md instructions for @ic-reactor

## Project snapshot

IC Reactor v3 is a TypeScript monorepo for Internet Computer apps.

Treat the published documentation and package manifests as the v3 release line.

### Packages

- `@ic-reactor/core` (`packages/core`, `3.6.0`) — core runtime, `ClientManager`, `Reactor`, `DisplayReactor`, cache integration.
- `@ic-reactor/react` (`packages/react`, `3.6.0`) — React bindings, actor hooks, query/mutation factories, Internet Identity auth, and identity-attribute hooks.
- `@ic-reactor/candid` (`packages/candid`, `3.6.0`) — dynamic Candid adapter/reactors and metadata reactors.
- `@ic-reactor/parser` (`packages/parser`, `0.4.6`) — Rust/WASM Candid parser.
- `@ic-reactor/codegen` (`packages/codegen`, `0.11.1`) — shared generation pipeline used by CLI and Vite plugin.
- `@ic-reactor/cli` (`packages/cli`, `0.11.1`) — `ic-reactor` CLI for explicit declaration/reactor generation.
- `@ic-reactor/vite-plugin` (`packages/vite-plugin`, `0.11.1`) — Vite plugin for watch-mode generation and local `ic_env` injection.

### Package alignment rules

- Describe published documentation as IC Reactor v3.
- Keep package-specific docs aligned with the released v3.6.0 runtime and its published tooling.
- Prefer `@icp-sdk/*` package names in docs and examples.
- Use `ClientManager` + `Reactor` + `createActorHooks` for React setup.

## Skills

A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Skills live in the `skill-packages/` directory. Below is the list of skills that can be used in this repository.

### Available skills

- `ic-reactor-hooks`: Create, refactor, and document Reactor hook integrations for this repo, including `createActorHooks`, query/mutation factories, `useActorMethod`, and generated hooks. Use when implementing or explaining hook usage inside React components versus imperative usage outside React. (file: `skill-packages/ic-reactor-hooks/SKILL.md`)
- `ic-reactor-packages`: Inspect, modify, review, or document the IC Reactor monorepo package architecture, package ownership, exports, tsconfig/project references, generated artifacts, dependency boundaries, and package verification workflows. Use when deciding which package owns a behavior or when work spans package metadata/build/test/release readiness. (file: `skill-packages/ic-reactor-packages/SKILL.md`)

## Package map

Use this map before editing so you can start in the package that owns the behavior:

| Package                   | Owns                                                                                                   | Look here first                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `@ic-reactor/core`        | Framework-agnostic runtime: `ClientManager`, `Reactor`, `DisplayReactor`, query-cache integration      | `packages/core/src/`, `packages/core/tests/`                                                      |
| `@ic-reactor/react`       | React hook factories, reusable query/mutation objects, `useActorMethod`, auth managers, and auth hooks | `packages/react/src/`, `packages/react/tests/`, `skill-packages/ic-reactor-hooks/SKILL.md`        |
| `@ic-reactor/candid`      | Runtime Candid fetching/parsing adapters and dynamic reactors                                          | `packages/candid/src/`, `packages/candid/METADATA_REACTOR_GUIDE.md`                               |
| `@ic-reactor/parser`      | Rust/WASM Candid parser package                                                                        | `packages/parser/src/`, `packages/parser/tests/`                                                  |
| `@ic-reactor/codegen`     | Shared declaration/reactor/client generation pipeline                                                  | `packages/codegen/src/`, `packages/codegen/src/*.test.ts`                                         |
| `@ic-reactor/cli`         | `ic-reactor` command-line interface and config schema                                                  | `packages/cli/src/`, `packages/cli/schema.json`                                                   |
| `@ic-reactor/vite-plugin` | Vite integration, `.did` watching, environment-cookie injection                                        | `packages/vite-plugin/src/`, `examples/vite-plugin-demo/`, `examples/vite-environment-variables/` |

## Verification commands

- Package builds: `pnpm build`
- Package tests: `pnpm test`
- Root type check used by CI: `pnpm exec tsc --noEmit`
- Example type checks: `pnpm typecheck:examples`
- Docs build: `pnpm docs:build`
- Dependency audit: `corepack pnpm audit --audit-level moderate`

Generated outputs under `dist`, `.dfx`, `.icp`, `.mops`, `target`, `.next`, `.astro`, and `*.tsbuildinfo` are normally build artifacts. Do not hand-edit generated hook files; change the generator, wrapper, or source `.did` instead.

## AI context files

- `llms.txt`: compact package/task routing manifest
- `llms-full.txt`: longer AI-friendly API and task guide

### How to use skills

- Discovery: Skill bodies live on disk at `skill-packages/<skill-name>/SKILL.md`. Agent-specific metadata is in `skill-packages/<skill-name>/agents/`.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description, use that skill for the turn.
- Missing/blocked: If a named skill is missing or the path can't be read, say so briefly and continue with the best fallback.
- Progressive disclosure:
  1. Open the skill `SKILL.md` and read only enough to follow the workflow.
  2. Load only the specific referenced files needed for the current request.
  3. Prefer bundled scripts/assets/references over recreating content.
- Coordination:
  1. Use the minimal set of skills that covers the task.
  2. State which skill(s) you're using and why (one short line).
- Context hygiene: Keep context small, avoid deep reference chasing, and load only relevant variant files.
- Safety and fallback: If a skill can't be applied cleanly, state the issue and continue with the next-best approach.

### Cross-agent compatibility

These skills are designed to work across multiple AI agent platforms. Each skill includes agent-specific metadata in `agents/`:

| Agent Platform     | Metadata File         | Project Discovery File            |
| ------------------ | --------------------- | --------------------------------- |
| OpenAI Codex       | `agents/openai.yaml`  | `AGENTS.md` (this file)           |
| Claude / Anthropic | `agents/claude.yaml`  | `CLAUDE.md`                       |
| GitHub Copilot     | `agents/copilot.yaml` | `.github/copilot-instructions.md` |
| Cursor             | —                     | `.cursorrules`                    |
