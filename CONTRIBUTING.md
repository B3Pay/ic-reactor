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

## Pre-commit hooks

This repo uses Husky + lint-staged. Hooks will be installed automatically when you run `pnpm install` (the `prepare` script runs `husky install`). The `pre-commit` hook runs `lint-staged` to format and add staged files.

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

## Commits & PRs

- Use clear, descriptive commit messages.
- Prefer small, focused PRs.
- Include tests where applicable.
- Add or update documentation for public API changes.

## Code style

- We use Prettier for formatting. Run `pnpm format` before opening a PR if you need to format files manually.

## Adding a package

To add a new package in the workspace, create a new folder under `packages/` and add it to the workspace if necessary. Follow existing package conventions for `package.json`, `tsconfig`, and build scripts.

## Reporting issues

Use the templates when creating issues. Fill out reproduction steps and environment details to help us triage faster.

Thanks again — we appreciate your contribution! 🎉
