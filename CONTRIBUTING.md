# Contributing to IC Reactor

Thanks for your interest in contributing! This project uses pnpm workspaces. Below are the common workflows and expected standards.

## Branches

- **`main`** is the line of ic-reactor 4. Open pull requests for new work
  against `main`. It releases 4.x: stable versions under npm's `latest`,
  prereleases (`4.1.0-beta.N`) under `beta`.
- **`v3`** is the 3.x line, cut from `main` at the 4.0 GA flip. It takes
  security fixes only, until 90 days after the 4.0 release, and 3.x security
  releases are tagged from it with its own workflow files. Open a 3.x security
  fix against `v3`.

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
pnpm size              # gzipped size limits, see [Size budget](#size-budget)
```

`pnpm check:snippets`, `pnpm check:snippets:docs` and `pnpm lint` read the
packages' built declarations, and `pnpm size` measures their built `dist`, so run `pnpm build` first. See [Code snippets](#code-snippets) for what to do
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

## Size budget

`pnpm size` (the CI step "Check package sizes") runs size-limit over the built
packages, gzipped. Every limit sits just above its measured size, on purpose:

| Check                   | Config                                        | What it measures                                                             |
| ----------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| Core Library            | `packages/core/.size-limit.js`                | core's own `dist/index.js`                                                   |
| React bindings          | `size-limit` in `packages/react/package.json` | react's own `dist/index.js`                                                  |
| App: `{ createClient }` | `scripts/size-app/.size-limit.js`             | `createClient` with all it pulls from core's peers                           |
| App: React path         | `scripts/size-app/.size-limit.js`             | `createClient`, `ReactorProvider` and `useClient`, with every peer but React |

size-limit adds every `peerDependencies` entry of the package it runs in to
each check's `ignore`, so the first two never see `@icp-sdk/core`,
`@candid-core/schema`, `@noble/curves` or `@tanstack/query-core`. The last two
run from `scripts/size-app/`, a private workspace package that declares no
peers, so a change in what core pulls from them fails there. Keep it free of
peers; `pnpm test:scripts` checks that.

A pull request that changes any of these numbers says by how much, in bytes,
and raises the limit it crosses in the same change; one that shrinks a number
by more than 0.5 kB lowers that limit. Where the config has comments (core's
and `scripts/size-app/`'s), they record the new measured size and margin. That
includes a dependency bump that moves a peer's size. Read the numbers with `pnpm build && pnpm size`; run
`pnpm exec size-limit --json` in `packages/core`, `packages/react` or
`scripts/size-app` for exact bytes.

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
a library export: a snippet that uses one must import it. `app/` holds a few
generic names and the generated modules the guide imports
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
CI runs in the job that installs the examples. Unlike the guides, a docs page
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

### `pnpm verify:audit` and the ignored advisories

`pnpm verify:audit` (the CI job "Audit") fails on any high or critical
advisory in the workspace. Fix one by raising the dependency, or a `pnpm.overrides`
entry in the root `package.json`, past the patched version. Only when no
patched version exists, and the package is reachable only from tooling that
never ships (the docs site's build, not `packages/*` or an example's runtime),
may the advisory go in `pnpm.auditConfig.ignoreGhsas`, with its reason here.
Remove an entry as soon as a patched version is released.

| Advisory                                                                 | Package                                             | Reached through                                                                                                     | Why it is ignored                                                                                                                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) | `http-cache-semantics` ≤ 4.2.0 (no patched version) | `docs > astro`                                                                                                      | A shared HTTP cache can serve one user's response to another through `max-stale`. The docs site is built to static files in CI; it runs no shared cache that serves users. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces` ≤ 3.0.3 (no patched version)               | `docs > remark-cli > unified-args > chokidar`, `docs > starlight-page-actions > vite-plugin-static-copy > chokidar` | A deeply nested pattern exhausts the stack. The patterns are the docs tooling's own file globs, not input from users.                                                      |

## Publishing (trusted publishing / tokens)

This repository enforces **OIDC Trusted Publishing** for releases (no long-lived publish tokens for the publish step). Trusted publishing is more secure and produces provenance attestations when used from GitHub Actions.

- To enable: go to your package on npmjs.com → Settings → Trusted publishers and add this repository's workflow filename (e.g., `release.yml`).
- `@ic-reactor/core`, `@ic-reactor/react` and `@ic-reactor/vite-plugin` trust `release.yml` (4.x from `main`, and core and react 3.x from `v3`). Until the 3.x line's end, `@ic-reactor/vite-plugin` also trusts `release-tools.yml`, which publishes its 0.x security releases from `v3`; remove that publisher then.
- Bind each trusted publisher to the `npm-release` environment, the environment of every publish job on `main` and `v3` (the GA-flip runbook does this after the 4.0.0 release). npm cannot edit a trusted publisher: add a new one with the same workflow and environment `npm-release`, then delete the old one that names no environment. A package can hold up to 10 publishers, and an unbound entry left next to a bound one still accepts any job, so the binding holds only once no entry for that workflow is left without an environment. It has no reviewer; it only lets npm refuse the publish job of an older commit, which has no environment (see "Tagging a 3.x release" below).
- Ensure the `release.yml` workflow has `permissions: id-token: write` (already configured).
- After enabling and validating Trusted Publishing, do not add a write `NPM_TOKEN` secret — publishing will use the OIDC token.

If your CI needs to install private dependencies, create a **read-only** granular token on npmjs.com and store it as `NPM_READ_TOKEN` (the install step will use this token when present).

On `main` the release lane publishes `@ic-reactor/core`, `@ic-reactor/react` and `@ic-reactor/vite-plugin` in lockstep from `v4.*` tags. `scripts/release-tag.mjs` decides for both `scripts/release.js` and `release.yml`: a stable 4.x version publishes under the `latest` dist-tag and becomes the latest GitHub Release, a 4.x prerelease publishes under `beta`, and any other version (3.x, 5.x, not semver) is refused. `release.yml` also requires the tagged commit to be on `main`.

The 3.x line releases from the `v3` branch with that branch's own workflows: `v3.*` tags publish `@ic-reactor/core` and `@ic-reactor/react` 3.x under the `v3-latest` dist-tag and `@ic-reactor/candid` under `latest` (it has no 4.x), and `tools-v*`/`parser-v*` tags publish `@ic-reactor/vite-plugin` 0.x under `v0-latest` and the parser, codegen and cli under `latest`. None of them moves `latest` of core, react or vite-plugin, or takes the GitHub "Latest" badge, as long as the tag is on a `v3` commit that contains those lanes.

### Tagging a 3.x release

A tag push runs the workflow file of the commit the tag points at, not the branch's current one. `main`'s history (and `v3`'s, up to the merge that added its lanes) holds 3.x commits whose `release.yml` and `release-tools.yml` publish any stable version under `latest`, and some of them carry a version that was never published (core, react and candid 3.0.5; codegen, cli and vite-plugin 0.15.0). A `v3.*`, `tools-v*` or `parser-v*` tag on such a commit runs that commit's workflow, and the older ones have no preflight and no approval job. Before you push a 3.x tag, check the commit it points at:

```sh
SHA=$(git rev-parse v3.13.1)   # or tools-v0.15.2, parser-v0.6.1
git show "$SHA":.github/workflows/release.yml | grep -q v3-latest && echo "v3 lane"           # for a v3.* tag
git show "$SHA":.github/workflows/release-tools.yml | grep -q v0-latest && echo "v0 lane"     # for a tools-v* or parser-v* tag
```

Push the tag only when the check prints its line. The `npm-release` environment closes this for good once no package has a trusted publisher left without it: the publish jobs of `release.yml` on `main` and of both lanes on `v3` run in it, and the publish jobs of older commits do not, so npm refuses their tokens.

`v3` and `main` may carry a ruleset that requires pull requests. A release script's printed `git push origin <branch>` then works only for a maintainer on the ruleset's bypass list. Otherwise push the release commit to a branch, merge its pull request with a merge commit (a squash or rebase would leave the tagged commit off the branch, and the preflight refuses it), and push the tag after the merge.

### Approving a release

Pushing a release tag no longer publishes unattended. The release workflow (`release.yml`; on `v3` there is also `release-tools.yml` for the 3.x tooling lane) runs an `Approve publish` job against the `npm-publish` environment, which requires a reviewer to approve the run once before any package is published; every package in the release then publishes on that single approval. Preflight still runs first, so by the time the run pauses the tag has been checked against its branch, the manifests, the build, the tests and `verify:packages`. Approve it from the run's page under Actions, or from the pending-deployments prompt on the workflow run. Approving completes the release unchanged; rejecting it publishes nothing. npm versions are immutable, so this is the last point at which a wrong release can be stopped rather than superseded.

The environment lives in repository settings (Settings → Environments → `npm-publish`) and carries:

- a required reviewer (self-approval allowed, so for a solo maintainer this is a confirmation step, not a second-person requirement);
- a deployment tag policy limited to `v*`, `tools-v*` and `parser-v*`, so a run from any other ref cannot deploy to it at all.

The `environment:` key is read from the tagged revision, like the preflight, so a tag pointing at a commit that predates it would skip the pause. The tag policy is settings-enforced, but it applies only to a job that names the environment, and such a commit names none: the `npm-release` binding of the trusted publishers is what refuses its publish. The `Release tags` ruleset, which limits who can create those tags, is the third leg; none of the three is sufficient alone.

## Commits & PRs

- Use clear, descriptive commit messages.
- Prefer small, focused PRs.
- Include tests where applicable.
- State the size delta of `pnpm size` (or that there is none), and raise a
  limit only deliberately, as [Size budget](#size-budget) says.
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
- The 3.x runtime is gone from `main`. Do not copy 3.x patterns (`ClientManager`, `Reactor`, hook factories) from the `v3` branch; follow the guide in `packages/core/llms.txt`.
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
