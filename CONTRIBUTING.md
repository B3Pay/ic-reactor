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
