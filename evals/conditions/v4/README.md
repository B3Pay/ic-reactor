# The `v4` condition

ic-reactor 4 as it will be published (issue #786): `@ic-reactor/core` and
`@ic-reactor/react` packed from this repository, `@candid-core/schema`
0.3.0-beta.1, and the module `@candid-core/cli` 0.2.0-beta.1 generates from
`harness/icrc1.did`. Agents get the core tarball's `llms.txt` as their only
documentation. It is the condition of the 4.0.0-beta.1 gate
(`PREREGISTRATION.md`, Addendum 3) and runs only when named
(`drive.mjs --condition v4`); the default matrix is the four conditions of
the pilots.

| File                             | What it is                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `condition.json`                 | the `{{LIBRARY}}` line and the docs list                                                                                                                |
| `package.json`                   | what an agent may import. `workspace:*` marks a package packed from this repository's `packages/`; everything else is pinned as in the other conditions |
| `starter/src/generated/icrc1.ts` | the CLI's output, unedited (setup.mjs regenerates it)                                                                                                   |
| `docs/llms.txt`                  | `packages/core/llms.txt` as packed into the core tarball (setup.mjs copies it). Until DX3 (#785) lands it is the placeholder guide                      |
| `node_modules/` (not tracked)    | the scorer's install: a copy of `.ship/v4/node_modules`, so the hidden tests run against exactly what agents get                                        |
| `PORTING.md`                     | the work list for porting the v4-proto references and faulty solutions to this condition                                                                |

The starter module is generated with:

```bash
npx --yes @candid-core/cli@0.2.0-beta.1 gen evals/harness/icrc1.did -o <dir>
```

run in a scratch directory (so evals' own `@candid-core/cli` 0.1.0 is not
picked up), keeping `<dir>/icrc1.ts` only; the CLI's `icrc1.envelope.json`
(the contract the module came from) is not something an app imports.

## How setup.mjs builds it

1. Builds `@ic-reactor/core` and `@ic-reactor/react` from this repository
   (`corepack pnpm --filter … build`, at the repository root) and packs them
   with `corepack pnpm --filter … pack --pack-destination <tmp>`, which
   rewrites `workspace:` ranges as a release does. The root workspace must
   be installed (`corepack pnpm install` at the repository root).
2. Installs the tarballs, from `.ship/v4/tarballs/`, with every pinned
   dependency into `.ship/v4/node_modules` as a flat npm install: no
   workspace links, no pnpm store paths.
3. Refuses the tree, deleting it, when the core tarball's `llms.txt` holds a
   hidden-test name or distinctive literal (`harness/check-docs.mjs`) or the
   packages' code names a hidden test (`harness/ship.mjs`).
4. Copies that `llms.txt` to `docs/llms.txt`, then cuts both packages to
   `package.json` + `dist/`: their READMEs and sources would be
   documentation beyond the one guide.
5. Runs the checks every condition gets (no unmet dependency; no repository
   path or hidden-test path anywhere in the shipped `node_modules`).
6. Copies `.ship/v4/node_modules` to `conditions/v4/node_modules` for the
   scorer. `conditions/v4` is not a member of evals' pnpm workspace: its
   ic-reactor packages exist only as tarballs that setup makes.

`harness/ship.test.mjs` checks the result (the cut packages, no repository
path, the single guide, the scorer's copy, the assembled starter) and the
refusal on seeded files.

## Status

No reference or faulty solution exists yet: `gate.mjs` reports
`skip <task>/v4: no reference solutions yet` for both tasks, and
`gate.mjs --require v4` (what Addendum 3 runs) fails on them. They wait for
the client and its builders (IR2t #782), the React bindings (IR6 #780) and
the guide (DX3 #785); `PORTING.md` lists the work.
