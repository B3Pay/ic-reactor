# Contributing to IC Reactor

Thanks for your interest in contributing! This project uses pnpm workspaces. Below are the common workflows and expected standards.

## Quickstart

1. Fork the repository and clone it:

```bash
git clone https://github.com/<your-username>/ic-reactor.git
cd ic-reactor
git remote add upstream https://github.com/B3Pay/ic-reactor.git
```

2. Install dependencies:

```bash
pnpm install
```

3. Run the build and tests locally:

```bash
pnpm build
pnpm test
```

4. Format files (automatically run on commit via Husky):

```bash
pnpm format
```

You can check formatting without modifying files:

```bash
pnpm format:check
```

Both scripts glob `packages/**` only, so root markdown, `docs/`, `examples/`,
and `skill-packages/` are not formatted or checked by them.

5. Run the remaining CI gates before opening a PR:

```bash
pnpm check:ai-context  # llms.txt versions match every package.json
pnpm typecheck         # every package, including its tests
```

If you changed a package's `exports`, `files`, build output, or module format,
also run:

```bash
pnpm verify:packages
```

It packs each publishable package, installs the tarballs into a scratch project
outside the workspace, imports and requires every entry point in real Node, and
runs `publint` + `attw`. Nothing else in CI can catch a broken published
artifact, because in-repo consumers resolve through workspace symlinks.

## Pre-commit hooks

This repo uses Husky + lint-staged. Hooks will be installed automatically when you run `pnpm install` (the `prepare` script runs `husky`). The `pre-commit` hook runs `lint-staged` to format and add staged files.

If you need to re-install hooks manually:

```bash
pnpm prepare
```

## Publishing (trusted publishing / tokens)

This repository enforces **OIDC Trusted Publishing** for releases (no long-lived publish tokens for the publish step). Trusted publishing is more secure and produces provenance attestations when used from GitHub Actions.

- To enable: go to your package on npmjs.com → Settings → Trusted publishers and add this repository's workflow filename (e.g., `release.yml`).
- Ensure the `release.yml` workflow has `permissions: id-token: write` (already configured).
- After enabling and validating Trusted Publishing, do not add a write `NPM_TOKEN` secret — publishing will use the OIDC token.

If your CI needs to install private dependencies, create a **read-only** granular token on npmjs.com and store it as `NPM_READ_TOKEN` (the install step will use this token when present).

The release workflow also auto-selects a publish tag from the git tag name: prerelease tags containing a hyphen (e.g., `v3.0.0-beta.1`) are published with the `beta` tag; stable tags publish to `latest`.

### Approving a release

Pushing a release tag no longer publishes unattended. Both release workflows (`release.yml` for `v*`, `release-tools.yml` for `tools-v*` and `parser-v*`) run an `Approve publish` job against the `npm-publish` environment, which requires a reviewer to approve the run once before any package is published; every package in the release then publishes on that single approval. Preflight still runs first, so by the time the run pauses the tag has been checked against `main`, the manifests, the build, the tests and `verify:packages`. Approve it from the run's page under Actions, or from the pending-deployments prompt on the workflow run. Approving completes the release unchanged; rejecting it publishes nothing. npm versions are immutable, so this is the last point at which a wrong release can be stopped rather than superseded.

The environment lives in repository settings (Settings → Environments → `npm-publish`) and carries:

- a required reviewer (self-approval allowed, so for a solo maintainer this is a confirmation step, not a second-person requirement);
- a deployment tag policy limited to `v*`, `tools-v*` and `parser-v*`, so a run from any other ref cannot deploy to it at all.

The `environment:` key is read from the tagged revision, like the preflight, so a tag pointing at a commit that predates it would skip the pause. The tag policy is settings-enforced and holds regardless. The `Release tags` ruleset, which limits who can create those tags, is the third leg; none of the three is sufficient alone.

## Commits & PRs

- Use clear, descriptive commit messages.
- Prefer small, focused PRs.
- Include tests where applicable.
- Add or update documentation for public API changes.

## Code style

- We use Prettier for formatting. Run `pnpm format` before opening a PR if you need to format files manually.

## AI-assisted contributions

AI-assisted contributions are welcome, but contributors are responsible for correctness before opening a PR.

- Prefer existing IC Reactor patterns over introducing new abstractions.
- For React integrations, prefer `createActorHooks(...)` or query/mutation factories (`createQuery`, `createMutation`, etc.) instead of ad hoc wrappers.
- If code must be used outside React, do not call hooks; use factory imperative methods like `.fetch()`, `.execute()`, `.invalidate()`, and `.getCacheData()`.
- For larger canisters or repeated boilerplate, prefer generated hooks via `@ic-reactor/cli` or `@ic-reactor/vite-plugin`.
- Validate generated or AI-written code with tests/examples whenever possible.
- Update docs/examples when public API usage changes.

Repository AI context:

- `llms.txt` — high-level context for LLMs
- `CLAUDE.md` — Claude / Anthropic project context
- `AGENTS.md` — OpenAI Codex agent instructions
- `skill-packages/` — local skill packages (multi-agent compatible)
- `B3Pay/ic-reactor-skills` — external IC Reactor skills repo (mirror)

## Adding a package

To add a new package in the workspace, create a new folder under `packages/` and add it to the workspace if necessary. Follow existing package conventions for `package.json`, `tsconfig`, and build scripts.

## Reporting issues

Use the templates when creating issues. Fill out reproduction steps and environment details to help us triage faster.

Thanks again — we appreciate your contribution! 🎉
