# Contributing to IC Reactor

Thanks for your interest in contributing! This project uses pnpm workspaces. Below are the common workflows and expected standards.

## Branches

- **`v4`** is the development line of ic-reactor 4. Open pull requests for
  new work against `v4`. It releases prereleases only (`4.0.0-alpha.N`,
  `4.0.0-beta.N`), never under npm's `latest`.
- **`main`** is the 3.x line and takes security fixes only until 4.0 GA. At
  GA, `v3` is cut from `main`, `v4` becomes `main`, and 3.x security releases
  are tagged from `v3`.

CI, e2e, CodeQL and dependency review run on pull requests to either branch,
each with the workflow files of its own line.

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

Both scripts cover the whole repo. Exclusions live in one place,
`.prettierignore`, which the pre-commit hook honours too, so the hook and the
CI gate operate on exactly the same set of files.

5. Run the remaining CI gates before opening a PR:

```bash
pnpm check:ai-context  # versions, package stamps and docs links in the AI guides
pnpm check:snippets    # compiles the ts/tsx snippets of the guides and READMEs
pnpm check:snippets:docs  # the same, plus the docs site's pages (needs the examples installed)
pnpm lint              # ESLint over packages/*/src and packages/*/tests
pnpm typecheck         # every package and e2e/, including their tests
```

`pnpm check:snippets`, `pnpm check:snippets:docs` and `pnpm lint` read the
packages' built declarations, so run `pnpm build` first. See [Code snippets](#code-snippets) for what to do
when a snippet fails.

If you touched `packages/` or `examples/`, also type-check and build every
example app. `tsc` never loads a bundler, so an example can type-check cleanly
and still fail to build:

```bash
pnpm typecheck:examples
pnpm build:examples
```

If you touched `docs/`, `packages/` or `examples/`, run the docs gate. CI lints
the MDX, checks the example pages against `examples/`, builds the site and
crawls it for broken links. The API reference is generated from package
sources, so a source change can break the docs build too:

```bash
pnpm --dir docs run lint:mdx
pnpm docs:check-examples   # sandbox links, file= targets and index cards
pnpm docs:build
pnpm docs:check-links   # crawls docs/dist, so run it after docs:build
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

## Code snippets

`pnpm check:snippets` compiles every ` ```ts `, ` ```tsx ` and
` ```typescript ` fence of `packages/*/llms.txt`, `skill-packages/**/*.md`
(when a skill exists), `README.md` and `packages/*/README.md`, each as its own
module, against the built packages. Agents copy these snippets into apps
as they stand, so when one fails, fix the snippet: add the import it is
missing, or update it to the current API.

A snippet may use names its app would define without importing them: a
canister's `./declarations/backend`, a `./reactor` module, a name built earlier
on the page. Those come from `scripts/check-snippets/`: `app/` is the app every
document shares, and a directory named in `CONTEXTS` in
`scripts/check-snippets.mjs` holds what differs for one document. A relative
import resolves to the module of the same path there, and `globals.ts` lists the
names a snippet may use without importing. Add a missing app name there, never
a library export: a snippet that uses one must import it. On the `v4` branch
`app/` holds a few generic names and the generated modules the guide imports
(`app/generated/icrc1.ts`, `app/generated/backend.ts`).

The consumer guides (`packages/*/llms.txt` and `skill-packages/ic-reactor/`)
get no globals, since an agent pastes them into
an app that has none: each of their snippets imports or declares every name
it uses. A relative import there resolves first to a snippet of the same
guide (or skill) whose first line names that file, such as `// src/reactor.ts`
for `./reactor`, so it is checked against the module the reader was shown.

A fence that is not code to paste, such as a type signature or an interface
restating a library type, opts out with `nocheck` after its language,
` ```ts nocheck `, or with `// @snippet-skip` as its first line. Give a
placeholder such as `...` a real value instead. `pnpm check:snippets --verbose`
lists every snippet with its result.

The docs site's hand-written pages (`docs/src/content/docs`, without the
TypeDoc output in `libs/`) are gated too, by `pnpm check:snippets:docs`, which
CI runs in the job that installs the examples. On the `v4` branch the site is
a placeholder until DX2, so the gate has no pages to compile yet. Unlike the
guides, a docs page
may assume the app it is about, so a page compiles against
`scripts/check-snippets/docs/<section>/` (its directory under the docs content
root, `root` for a page at the top), then against the default app. Put a name
the page assumes there, such as the canister its examples call or a component
the page only mentions. A fence that uses a library export still imports it,
and a fixture never re-exports one. A library an example app installs is the
real package once that example is listed in `DEPENDENCY_SOURCES`; the few
installed nowhere are declared once, faithfully, in
`scripts/check-snippets/ambient.d.ts`. An `@/` import resolves to a fixture
at that path. The checker type-checks, and it fails a snippet that calls a hook
(`useXxx(...)` or `query.useXxx()`) outside a component or a custom hook: at
the top of the module, in a class, or in a function that is not capitalised or
named `useXxx`. Wrap it in a component. A call that must fail to compile is shown with
`// @ts-expect-error`. Rules it cannot see (no hand-written query keys, update
methods only through mutations) are yours to keep when you write an example.

## Pre-commit hooks

This repo uses Husky + lint-staged. Hooks will be installed automatically when you run `pnpm install` (the `prepare` script runs `husky`). The `pre-commit` hook runs `lint-staged` to format and add staged files.

If you need to re-install hooks manually:

```bash
pnpm prepare
```

## Troubleshooting

### `Cannot find native binding` after a dependency bump

A `node_modules` installed before a dependency bump and then updated in place
can lose its link to a native optional package while the package itself stays
on disk. Run `pnpm install` first. For satteri's binding, which the workspace
hoists (see below), that is enough. If the error remains, the lost link is one
a plain install does not recreate, with or without `--frozen-lockfile`. Relink
every package instead:

```bash
pnpm install --force
```

If that is not enough, delete every `node_modules` in the workspace and
install from scratch:

```bash
pnpm clean && pnpm install
```

The error blames an npm bug and tells you to delete `package-lock.json` and
run `npm i` again. That text comes from the native package's loader. This repo
uses pnpm and has no `package-lock.json`, so the advice does not apply.

The Astro 7.3 bump did this to satteri's binding, and `pnpm docs:build` failed
with `Cannot find module '@bruits/satteri-<platform>'` (issue #408).
`pnpm-workspace.yaml` now hoists that binding to the root `node_modules`, so
the docs build no longer depends on the lost link. A future bump can still
strand a different native package the same way.

## Publishing (trusted publishing / tokens)

This repository enforces **OIDC Trusted Publishing** for releases (no long-lived publish tokens for the publish step). Trusted publishing is more secure and produces provenance attestations when used from GitHub Actions.

- To enable: go to your package on npmjs.com → Settings → Trusted publishers and add this repository's workflow filename (e.g., `release.yml`).
- Ensure the `release.yml` workflow has `permissions: id-token: write` (already configured).
- After enabling and validating Trusted Publishing, do not add a write `NPM_TOKEN` secret — publishing will use the OIDC token.

If your CI needs to install private dependencies, create a **read-only** granular token on npmjs.com and store it as `NPM_READ_TOKEN` (the install step will use this token when present).

On the `v4` branch the release lane publishes `@ic-reactor/core`, `@ic-reactor/react` and `@ic-reactor/vite-plugin` in lockstep from `v4.*` tags, and only prereleases: `scripts/release.js` refuses a version without a prerelease tag, and `release.yml` refuses a tag without a hyphen, requires the tagged commit to be on `v4`, and publishes under the `beta` dist-tag. Nothing on `v4` publishes to `latest` before GA.

### Approving a release

Pushing a release tag no longer publishes unattended. The release workflow (`release.yml`; on `main` there is also `release-tools.yml` for the 3.x tooling lane) runs an `Approve publish` job against the `npm-publish` environment, which requires a reviewer to approve the run once before any package is published; every package in the release then publishes on that single approval. Preflight still runs first, so by the time the run pauses the tag has been checked against its branch, the manifests, the build, the tests and `verify:packages`. Approve it from the run's page under Actions, or from the pending-deployments prompt on the workflow run. Approving completes the release unchanged; rejecting it publishes nothing. npm versions are immutable, so this is the last point at which a wrong release can be stopped rather than superseded.

The environment lives in repository settings (Settings → Environments → `npm-publish`) and carries:

- a required reviewer (self-approval allowed, so for a solo maintainer this is a confirmation step, not a second-person requirement);
- a deployment tag policy limited to `v*`, `tools-v*` and `parser-v*`, so a run from any other ref cannot deploy to it at all.

The `environment:` key is read from the tagged revision, like the preflight, so a tag pointing at a commit that predates it would skip the pause. The tag policy is settings-enforced and holds regardless. The `Release tags` ruleset, which limits who can create those tags, is the third leg; none of the three is sufficient alone.

## Commits & PRs

- Use clear, descriptive commit messages.
- Prefer small, focused PRs.
- Include tests where applicable.
- Add or update documentation for public API changes.
- Record a change users will notice under `## Unreleased` in
  [`CHANGELOG.md`](./CHANGELOG.md), in its package's Added, Changed,
  Deprecated or Fixed list. A behaviour change gets a one-line migration hint.

## Changelog at release time

The release scripts do not edit `CHANGELOG.md`. Before tagging, move the
entries of the packages being released from `## Unreleased` into a new section
named after the release (for example `## core, react, vite-plugin 4.0.0-beta.1`). The GitHub release that
the tag creates still generates its own notes from the merged pull requests.

## Code style

- We use Prettier for formatting. Run `pnpm format` before opening a PR if you need to format files manually.

## AI-assisted contributions

AI-assisted contributions are welcome, but contributors are responsible for correctness before opening a PR.

- Prefer existing IC Reactor patterns over introducing new abstractions.
- The 3.x runtime is removed on `v4` and the 4 API arrives slice by slice (milestone 1, #790). Do not copy 3.x patterns (`ClientManager`, `Reactor`, hook factories) from `main`; follow the guide in `packages/core/llms.txt` once it lands.
- Validate generated or AI-written code with tests/examples whenever possible.
- Update docs/examples when public API usage changes.

Repository AI context:

- `AGENTS.md` — task-to-source routing and verification commands (read this
  first)
- `CLAUDE.md` — Claude / Anthropic project context

Consumer AI context (for apps that install the packages; keep repo paths,
pnpm commands and CI notes out of it): `packages/core/llms.txt`, shipped in
core's tarball and opening with an `Applies to` version line, and the one
consumer skill, `skill-packages/ic-reactor/SKILL.md`, which points at it.

## Adding a package

To add a new package in the workspace, create a new folder under `packages/` and add it to the workspace if necessary. Follow existing package conventions for `package.json`, `tsconfig`, and build scripts.

## Reporting issues

Use the templates when creating issues. Fill out reproduction steps and environment details to help us triage faster.

Thanks again — we appreciate your contribution! 🎉
