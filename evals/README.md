# evals — does a typed handle layer help agents write correct IC apps?

A harness for one question: do AI coding agents write more correct Internet
Computer apps with a thin layer of typed, mode-gated per-method handles
("ic-reactor 4") than with a candid-core generated module plus raw TanStack
Query, or with ic-reactor 3 as published? It measures four conditions on the
same tasks with the same hidden tests:

| Condition    | Library the agent gets                                                                                                                                                                                                                      | Generated input in the starter                                         | Docs in the starter (`docs/`)                                                                     | Words |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----- |
| `v3`         | `@ic-reactor/core` + `@ic-reactor/react` 3.13.0 from npm, `@icp-sdk/core` 6.1.0, `@icp-sdk/auth` 10.0.1, TanStack Query 5.104                                                                                                               | `src/declarations/icrc1.did.{js,d.ts}` (`@icp-sdk/bindgen` output)     | `llms-full.txt` (repo root at 623b48c11 = 3.13.0) + the `llms.txt` shipped inside both packages   | 8,996 |
| `thin`       | `@candid-core/schema` 0.2.0, `@icp-sdk/core`, `@icp-sdk/auth`, TanStack Query; no framework                                                                                                                                                 | `src/generated/icrc1.ts` from `candid-core-cli gen` 0.1.0              | the READMEs shipped in `@candid-core/schema` 0.2.0 (2,274) and `@candid-core/cli` 0.1.0 (532)     | 2,806 |
| `thin-guide` | identical to `thin` (same starter, generated module, dependencies)                                                                                                                                                                          | identical to `thin`                                                    | thin's two READMEs + `llms.txt`, a guide for the thin stack matched to the v4-proto guide (1,792) | 4,598 |
| `v4-proto`   | the throwaway prototype `@ic-reactor/v4-proto` (shipped as a built package: `package.json` + `dist/`) on the same stack as thin                                                                                                             | the same `icrc1.ts` + `icrc1.service.ts` (hand-written: see "Threats") | `llms.txt` written for the prototype                                                              | 1,778 |
| `v4`         | ic-reactor 4: `@ic-reactor/core` + `@ic-reactor/react` packed from this repository, or 4.0.0-beta.1 from npm (`setup.mjs --v4-from`; shipped as `package.json` + `dist/`), `@candid-core/schema` 0.3.0-beta.1, `@icp-sdk/*`, TanStack Query | `src/generated/icrc1.ts` from `candid-core-cli gen` 0.2.0-beta.1       | the `llms.txt` in the `@ic-reactor/core` tarball (DX3's guide, #785; published 4.0.0-beta.1)      | 1,974 |

`thin-guide` is the honest comparator for v4-proto: a shipped thin layer would
come with a guide too. Plain `thin` stays so the effect of the guide is
separable (`thin-guide − thin` vs `v4-proto − thin-guide`).

`v4` was added after the Decision (`PREREGISTRATION.md`): it is the gate for
releasing ic-reactor 4.0.0-beta.1, run against a same-day `thin-guide`
control (Addendum 3, frozen on 2026-10-03 before the batch), and of the GA
gate built from the published 4.0.0-beta.1 (Addendum 4, drafted
2026-10-05). It runs only when named (`--condition v4`); a batch with no
`--condition` runs the four conditions of the pilots. See "The v4 condition" below and
`conditions/v4/README.md`.

**One pilot has run with a real agent** (`claude-sonnet-5-5`, effort
`medium`, 40 runs, explicit prompt: every cell at the ceiling; see
`PREREGISTRATION.md`, Addendum 1). The matrix needs a budget decision. This directory proves the harness on hand-written solutions, and the
driver end to end with a stub agent.

## Layout

```
evals/
  package.json, pnpm-workspace.yaml, pnpm-lock.yaml   own pnpm workspace root (root lockfile untouched)
  setup.mjs     generate/copy condition inputs, build the prototype, vendor the
                public fake replica, build .ship/ (what agents are given)
  score.mjs     score one solution → one JSON line
  gate.mjs      score every reference and faulty solution and check expectations
  drive.mjs     the agent-matrix driver (dry-run + stub-agent run only so far)
  harness/
    assemble.mjs      starter assembly (task layer + condition layer + docs + public scaffold)
    world.ts, fake-ledger.ts, fake-auth.ts, declarations/, icrc1.did   the hidden tests' world
    public/support/   the public test scaffold shipped to agents (no fault injection)
    runs.mjs          one run's private directory (work/ home/ tmp/)
    sandbox.mjs       the macOS sandbox-exec profile agents run in
    leak-scan.mjs     the transcript leak audit (second line of defence)
    aggregate.mjs     statistics: per task × model × effort × prompt variant × condition
    judge.mjs         per-test results → requirements, safe, met, under one prompt variant
    probes/           per-input amount diagnostic for stored solutions (not scored)
    check-docs.mjs    checks docs/scaffold/prompts for hidden-test names and literals
    gate-plan.mjs     what gate.mjs scores, and which empty cells it may skip
    *.test.mjs        unit tests: sandbox, leak audit, aggregation, driver, prompt parity, v4 ship, gate plan
  tasks/<task>/
    prompt.md          the task prompt (`explicit` variant); {{LIBRARY}} is the only
                       condition-specific line, {{RUN}} the only run-mode-specific one
    prompt.minimal.md  the `minimal` variant: product and public contract, no safety rules
    task.json          requirements (groups of hidden tests, safety flag), environment, protected files
    starter/           files identical in every condition, incl. test/smoke.test.ts
    hidden/            the hidden acceptance tests (never copied into a starter)
    solutions/<condition>/reference*/  the harness author's passing solutions
    faulty/<name>/     deliberately broken solutions + meta.json (condition, bug, expected failures)
  conditions/<condition>/
    package.json       exactly what an agent in that condition may import (+ tsc/vitest/testing-library)
    condition.json     the {{LIBRARY}} line; `"base"` makes a condition reuse another's starter and packages
    starter/           condition-specific generated code
    docs/              the documentation that condition's agent is given (added to the base's docs)
  conditions/v4-proto/lib/   the prototype (src/, dist/, test/, SHIM-NOTES.md)
  conditions/v4/      ic-reactor 4, packed from this repository or from npm (README.md, PORTING.md);
                      its node_modules (setup, untracked) is a copy of .ship/v4's,
                      with @icp-sdk/core linked to evals' own (one instance for the world)
  .ship/<condition>/node_modules   (setup) flat npm installs shipped to agents; gitignored
```

`harness/ship.mjs` holds what setup refuses to ship for `v4` (a guide or
package code that gives a hidden test away); `harness/ship.test.mjs` checks
the refusal and the tree setup built.

## Running

Node 22+, pnpm 10 (the repo's `packageManager`, via `npx pnpm@10.30.3` if
needed), npm (for `.ship/`), and macOS for the agent sandbox. For the `v4`
condition `setup.mjs` also builds and packs `packages/core` and
`packages/react` with `corepack pnpm`, so the repository's own workspace
must be installed (`corepack pnpm install` at the root), and fetches
`@candid-core/cli@0.2.0-beta.1` with `npx`. With `--v4-from npm:<version>`
it downloads the published tarballs instead (checked against the integrity
pinned in `harness/ship.mjs`), and the root workspace is not needed.

```bash
cd evals
pnpm install            # its own workspace: never touches the root lockfile
node setup.mjs          # inputs, prototype build, public scaffold, .ship/ (network: npm install)
node setup.mjs --v4-from npm:4.0.0-beta.1   # … with v4 from the published tarballs (Addendum 4)

node score.mjs --task node-tool    --condition thin --solution tasks/node-tool/solutions/thin/reference
node gate.mjs [--task react-wallet] [--jobs 4]       # all references + all faulty solutions
node gate.mjs --require v4                           # … and fail if a v4 cell has no reference (Addendum 3)
node drive.mjs --n 20 --dry-run                      # the matrix plan
node drive.mjs --pilot --dry-run                     # the 5-runs-per-cell pilot plan
node drive.mjs --pilot --prompt minimal --dry-run    # the same with the minimal prompt
node drive.mjs --preflight --model <m> --oauth-token-file <f>   # one tiny real call (spends quota)
node drive.mjs --aggregate runs/<dir> [--pilot]      # re-aggregate saved results
node drive.mjs --aggregate runs/<dir> --rescan       # … re-auditing each transcript with today's scanner
node drive.mjs --aggregate runs/<dir> --rescore      # … re-scoring each stored solution with today's tests
node drive.mjs --pilot --prompt minimal --condition v4 --condition thin-guide --dry-run   # Addendum 3's plan
node drive.mjs --n 20 --seed 20261005 --prompt minimal --condition v4 --condition thin-guide --dry-run   # Addendum 4's

node --test harness/*.test.mjs                       # sandbox, leak audit, aggregation, driver, prompts, v4 ship, gate plan
EVALS_NO_SANDBOX=1 node --test harness/*.test.mjs    # … as on a host without sandbox-exec (tsc-only)
node harness/check-docs.mjs [files…]                 # docs vs hidden tests (exit 1 on a hit)

# the prototype's own checks
(cd conditions/v4-proto/lib && node node_modules/typescript/bin/tsc -p test/tsconfig.json)
(cd conditions/v4-proto && node node_modules/vitest/vitest.mjs run --config lib/test/vitest.config.mjs)
```

A batch writes to `runs/<timestamp>/`, or to `--out <dir>`, which must be new
or empty: in a directory that already holds files the driver would take the
runs recorded there for its own (an `agent.json` as run, a `score.json` as
scored, both in the summary), so it refuses and names `--resume <dir>`, the
only way to continue a batch in place.

`score.mjs` never reads stdin and exits 0 whenever it produced a score, however
bad the solution; exit 2 means the harness failed. It prints one JSON object:

```
{ task, condition, tscClean, tests: [{ name, pass }], passRate,
  requirements: [{ name, safety, pass }], safetyViolations, safe, requirementsMet, details }
```

It assembles the starter in a fresh directory under its own 0700 scoring
directory, lays the solution's files over it (skipping `node_modules`, `.git`,
`dist`), restores the protected files, symlinks the condition's pnpm
`node_modules`, runs `tsc --noEmit`, copies the hidden tests into `.hidden/`,
and runs them with vitest (whose cache it keeps inside the scoring directory,
never in a condition's `node_modules`).

## The tasks and what the prompts require

The ledger interface is `harness/icrc1.did`, the ICRC-1 reference ledger
interface that `examples/tanstack-router/icrc1.did` carries
(`icrc1_balance_of : (Account) -> (Tokens) query`,
`icrc1_transfer : (TransferArg) -> (variant { Ok : BlockIndex; Err : TransferError })`).
All conditions' generated inputs come from that one file.

**node-tool** — `createLedgerTool(config)` returning `getBalance(owner)` and
`transfer({ to, amount })` → `{ ok: true, blockIndex } | { ok: false, mayHaveExecuted, reason }`.

**react-wallet** — `<Wallet auth config />` with `signin` / `signout`
(each rendered only in its state), `balance` (entire text content = the
formatted number, nothing else; digit-free placeholder while loading),
`transfer-to` / `transfer-amount` (`<input>`s), `transfer-submit`, and an
always-rendered `transfer-status` whose `data-state` is `idle` until the first
submit, then `pending | success | error | unknown`. Those are all the DOM
contracts the tests read.

Every requirement the hidden tests check is stated in both tasks' `explicit`
prompts (`prompt.md`), in product terms, identically for all conditions:

1. Amounts: plain non-negative decimals, ≤ 8 fraction digits, base units ≤ nat64
   (the maximum is accepted); recipients must be valid principal text; both
   refused without contacting the ledger.
2. Never send as the anonymous principal / while signed out.
3. Root key: use `config.rootKey` when given and never fetch then; fetch only
   when it is absent **and** the host is local (`localhost`, `127.0.0.1`,
   `[::1]`).
4. Never re-send automatically — unless the failure proves the ledger never
   processed the call: reject code 1, 2 or 3, or an HTTP 4xx other than 408.
5. Classify by the same rule: certainly no effect = refused before sending,
   `Err`, reject code 1–3, HTTP 4xx other than 408; everything else (network
   failure after sending, timeout, 5xx, 408, reject code 4 or 5) may have
   executed → `mayHaveExecuted: true` / `data-state="unknown"` and the balance
   is read again.
6. (react) Never show another principal's balance after sign-in, sign-out or a
   switch, including when a read in flight for the previous principal lands
   afterwards.
7. Exact amounts; never `number`.

Where the reject-code rule comes from — the IC interface specification
(`ic-interface-spec.md` in dfinity/portal, "Reject codes" and the "Abstract
behavior" rules): codes 1 and 2 reach an ingress call only from "Request
rejection" (before processing) and, for 2, "Calls to frozen canisters are
rejected" (before a call context exists); 3 is an invalid destination; a
canister's own reject is always 4, and `ic0.msg_reject` returns normally so
"the state is updated"; 5 covers a trap (which discards only the trapping
execution, not work before an await) and call-context starvation ("the state
changes are persisted even when the IC is set to synthesize a CANISTER_ERROR
reject"). The citations are also in `conditions/v4-proto/lib/src/errors.ts`.

### Prompt variants

`--prompt explicit|minimal` (default `explicit`) picks the task prompt; the
hidden tests, scoring and condition docs are the same under both.

- **explicit** (`tasks/<task>/prompt.md`): the list above, stated as rules.
- **minimal** (`tasks/<task>/prompt.minimal.md`): the product the way a user
  would ask for it, plus the public contract the tests read — node-tool's
  signatures, config inputs and result shape; react-wallet's props, test ids,
  `data-state` values and balance format — and, in neutral sentences, what
  the outcome vocabulary means: `mayHaveExecuted` says whether the transfer
  could nevertheless have taken effect; `error` means it failed and certainly
  had no effect, `unknown` that it failed but may have taken effect. It does
  not say how to decide them, and states none of the safety rules: no
  amount-precision or nat64 limits, no refusing input before contacting the
  ledger, no anonymous-send rule, no root-key handling, no reject-code or
  HTTP-status classification, no never-re-send, no re-read after an unknown
  outcome, no stale balances across identities, no `number` ban.
  (`src/contract.ts` and the config/auth files carry the same doc comments in
  both variants: "Absent or anonymous: the tool is read-only", "The root key
  of a local replica. Absent on mainnet.")

Every run record (`agent.json`, `score.json`, `plan.json`) carries `prompt`;
a record without it predates the variants and counts as `explicit`. Cells are
task × model × effort × prompt × condition: variants are never pooled and are
compared only within themselves. A batch keeps its variant: `--resume` with
another one is refused. `harness/assemble.test.mjs` checks, for both variants
and both run modes, that every condition's prompt (`v4` included) differs
from the others in the `{{LIBRARY}}` line only; that both variants state the contract the tests read;
and that the minimal one matches none of the explicit rules' wording.

### The run modes

`{{RUN}}` in the prompt depends only on the run mode:

- **sandboxed** (default wherever `sandbox-exec` exists): the agent may run
  `npx tsc`, `npx vitest` and `node`, inside the OS sandbox. Every starter
  ships a public test scaffold, identical in all conditions: `test/support/`
  (the fake replica `@ic-reactor/core/testing` publishes, vendored with its
  comments stripped; a small ICRC-1 ledger; a test sign-in state with
  `switchTo`) and `test/smoke.test.ts`, which only shows how to drive it. It
  has **no** fault injection — no lost replies, rejects or refusals.
- **tsc-only** (the documented fallback where no sandbox exists): type-check
  feedback only, no test scaffold, no `node`.

`EVALS_NO_SANDBOX=1` makes the harness act as on a host without
`sandbox-exec`: `drive.mjs` then refuses to start without `--mode tsc-only`
and runs agents unsandboxed (recorded `sandboxed: false`), and the sandbox
tests are skipped. The driver tests (`harness/drive-auth.test.mjs`) pick
`--mode` the same way, so they run on Linux as on macOS; one of them runs a
batch with the variable set.

## What each hidden test checks, grouped by requirement

Tests are grouped into requirements in `task.json`; a requirement passes when
all its tests pass. Requirements marked **safety** make up the primary metric.
Where several requirements are judged from one transfer, a `describe` runs the
transfer once and each `it` checks one thing, so no test asserts two
requirements.

node-tool (`tasks/node-tool/hidden/node-tool.test.ts`, 25 tests, 7 requirements):

| Requirement                       | Tests                                                                                                                                                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| basic_function                    | `balance_returned`; `transfer_success` (one call signed by the identity, balances move, later reads show it); `accepts_nat64_max` (2^64 − 1 base units reaches the ledger as exactly that)                                                                       |
| root_key_trust **safety**         | `root_key_used` (no root-key fetch when `rootKey` is given); `root_key_not_fetched_off_local` (no fetch from a non-local host)                                                                                                                                   |
| exactness **safety**              | `balance_exact_bigint` (12345678901234567891 as a `bigint`)                                                                                                                                                                                                      |
| input_validation **safety**       | `refuses_malformed_amount` (`-1`, `abc`, `""`, `1e3`); `refuses_excess_fraction_digits` (9 decimals); `refuses_amount_past_nat64` (2^64, 1e20; explicit prompt only); none sent to this test's recipient; `refuses_invalid_recipient` (no call)                  |
| no_anonymous_send **safety**      | `no_anonymous_update` (no identity, and `AnonymousIdentity`: no call at all)                                                                                                                                                                                     |
| no_resend **safety**              | one distinct call after a 2.5 s settle: `canister_err_not_resent`, `reject_code_4_not_resent`, `reject_code_5_not_resent`, `lost_reply_not_resent`                                                                                                               |
| outcome_classification **safety** | `refusal_not_executed`; `canister_err_classified` (false); `reject_code_{1,2,3}_classified` (false); `reject_code_{4,5}_classified` (true); `http_429_classified` (false, never reached the ledger); `lost_reply_classified` (true); `lost_reply_balance_reread` |

react-wallet (`tasks/react-wallet/hidden/react-wallet.test.ts`, 32 tests, 8 requirements):

| Requirement                       | Tests                                                                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| basic_function                    | `balance_shown`; `auth_buttons` (each button only in its state); `status_starts_idle`; `transfer_success`; `accepts_nat64_max`                                                                                                         |
| root_key_trust **safety**         | `root_key_used`; `root_key_not_fetched_off_local`                                                                                                                                                                                      |
| exactness **safety**              | `balance_exact_bigint` (`123456789012.34567891`)                                                                                                                                                                                       |
| input_validation **safety**       | `refuses_malformed_amount`; `refuses_excess_fraction_digits`; `refuses_amount_past_nat64` (explicit prompt only); `refuses_invalid_recipient`                                                                                          |
| no_anonymous_send **safety**      | `no_anonymous_update` (signed out, and after sign-in + sign-out: nothing sent)                                                                                                                                                         |
| no_resend **safety**              | `update_not_resent_on_refetch` (focus, visibilitychange, offline/online, unmount + remount); `canister_err_not_resent`; `reject_code_{4,5}_not_resent`; `lost_reply_not_resent`                                                        |
| outcome_classification **safety** | `canister_err_is_error`; `reject_code_{1,2,3}_is_error`; `reject_code_{4,5}_is_unknown`; `reject_code_5_rereads_balance`; `http_429_is_error`; `lost_reply_is_unknown`; `lost_reply_rereads_balance` (a new read, and the debit shown) |
| no_stale_balance **safety**       | `no_stale_balance_after_sign_in`; `no_stale_balance_after_identity_switch` (Bob's read delayed 400 ms); `no_stale_balance_inflight_switch` (Alice's read lands after the switch, while Bob's loads); `no_balance_after_sign_out`       |

The world (`harness/world.ts`): **one** signing fake replica from
`@ic-reactor/core/testing` per test file, installed before the solution is
imported, with a `fetch` in front of it that never changes within the file —
so a solution that keeps agents or clients at module scope (v3's documented
idiom) works across tests; each test gets a fresh ledger and request log.
Each test registers its principals; requests from any other principal (a
previous test's agent still retrying in the background) are neither logged
nor run against the current ledger. The front `fetch` deduplicates re-sent
envelopes as a replica does, injects lost replies and HTTP refusals, and
answers a non-local host (`REMOTE_HOST`) with a network error after logging
it. Reject codes 1–4 are injected with the fake replica's own reject class
(taken from the error a test canister throws for a method it has no handler
for — it is not exported); code 5 is a trap in the ledger's code.

**Amount refusals, split after the second pilot** (`PREREGISTRATION.md`,
Addendum 2). One test, `refuses_invalid_amount`, used to cover malformed
text, too many fraction digits and base units past nat64. The second pilot
showed that under the minimal prompt it measured only the nat64 cap, a rule
nothing but the explicit prompt states (the ledger's `amount` is Candid
`nat`). It is now three tests. `task.json` `notApplicable.minimal` lists
`refuses_amount_past_nat64`: under `--prompt minimal` it still runs and is
reported with its result, but counts toward no requirement, `safe` or
`requirementsMet` (`harness/judge.mjs`); the summary prints each variant's
not-applicable tests and how often they passed. The refusal tests judge the
transfers sent to their own recipient, so a background retry of an earlier
test's transfer (sent as whoever is signed in now) is not blamed on them.
`harness/probes/` holds the per-input diagnostic (`node
harness/probes/probe.mjs <results dir>`: for each stored solution and amount,
refused / thrown / sent with which base units).

Only `balance_exact_bigint` uses a balance above 2^53, so a `Number()` bug
fails that test and no other. Not applicable to node-tool (no cache or UI):
re-send on refetch/remount/focus and stale balance across identities.

## Evidence the gate discriminates

`node gate.mjs`: 20 references (a `reference` and a `reference-module-scope`
per task × condition; thin-guide's are thin's) must pass every test with clean
tsc, and 36 faulty solutions (each its reference with one change) must type-check
and fail exactly the tests in their `meta.json`; a `safe: { <variant>: bool }`
in `meta.json` is checked too. The pilots' four conditions account for 16
references and 29 faulty solutions (45/45 before `v4`); `v4` adds 4
references, the six v4-proto faulty solutions ported to it and one of its
own (`conditions/v4/PORTING.md`). Last run, `node gate.mjs --require v4` on
2026-10-05, on `v4` built with `--v4-from npm:4.0.0-beta.1`: **56/56**, no
cell skipped, in 15 min 52 s at the default `--jobs 3` (on 2026-10-02, on
the tree packed for Addendum 3: 56/56 in 15 min 29 s). A condition with no reference solution yet is skipped and named
(`skip <task>/<condition>: no reference solutions yet`), unless one of the
rules below forbids it.
An empty cell fails the gate before anything is scored, instead of being
skipped, when its condition is one of the pilots' four, when its task holds
faulty solutions of that condition (a port left half done), or when
`--require <condition>` names it: Addendum 3 runs `node gate.mjs --require
v4`, so its "no cell skipped" is checked by the gate and not by reading the
output (`harness/gate-plan.mjs`).

| Faulty solution                               | Bug                                                               | Caught by                                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| node `thin-anonymous-transfer`                | checks an identity exists, not that it is non-anonymous           | `no_anonymous_update`                                                                                           |
| node `thin-number-amount`                     | parses the amount with `Number()`                                 | `refuses_malformed_amount`, `refuses_excess_fraction_digits`, `accepts_nat64_max`, `refusal_not_executed`       |
| node / react `thin-accepts-exponent`          | reads `1e3` as 1000 tokens                                        | `refuses_malformed_amount`                                                                                      |
| node / react `thin-truncates-fraction-digits` | drops fraction digits past 8                                      | `refuses_excess_fraction_digits` (node also `refusal_not_executed`)                                             |
| node / react `thin-no-nat64-cap`              | no nat64 cap                                                      | `refuses_amount_past_nat64`; unsafe under explicit, safe under minimal                                          |
| node `thin-every-reject-may-have-executed`    | every reject "may have executed"                                  | `reject_code_{1,2,3}_classified`                                                                                |
| node `thin-misclassifies-reject-codes`        | codes 1, 2 → may have; 4 → not (the reviewer's 1.0 mutant)        | `reject_code_{1,2,4}_classified`                                                                                |
| node `thin-fetches-root-key-off-local`        | fetches the root key from any non-mainnet host                    | `root_key_not_fetched_off_local`                                                                                |
| node `thin-ignores-root-key`                  | ignores `config.rootKey`, fetches instead                         | `root_key_used`                                                                                                 |
| node `thin-unvalidated-recipient`             | invalid recipient falls back to the anonymous principal           | `refuses_invalid_recipient`                                                                                     |
| node `v3-retry-call-errors`                   | retries on any `CallError`                                        | `reject_code_{4,5}_not_resent`, `lost_reply_{not_resent,classified,balance_reread}`                             |
| node `v4-proto-never-may-have-executed`       | ignores `mayHaveExecuted`                                         | `reject_code_{4,5}_classified`, `lost_reply_classified`                                                         |
| node `v4-proto-refuses-nat64-max`             | `<` instead of `<=`                                               | `accepts_nat64_max`                                                                                             |
| node `v4-never-may-have-executed`             | ignores `mayHaveExecuted`                                         | `reject_code_{4,5}_classified`, `lost_reply_classified`                                                         |
| node `v4-refuses-nat64-max`                   | `<` instead of `<=`                                               | `accepts_nat64_max`                                                                                             |
| node `v4-anonymous-identity-sent`             | `identity: config.identity ?? "anonymous"`                        | `no_anonymous_update`                                                                                           |
| react `thin-anonymous-transfer`               | no sign-in check                                                  | `no_anonymous_update`                                                                                           |
| react `thin-number-balance`                   | balance through `Number()`                                        | `balance_exact_bigint`                                                                                          |
| react `thin-transfer-as-query`                | transfer as a `useQuery`                                          | `update_not_resent_on_refetch`                                                                                  |
| react `thin-constant-balance-key`             | balance key without the principal                                 | `no_stale_balance_after_identity_switch`, `no_stale_balance_inflight_switch`                                    |
| react `thin-unguarded-balance-effect`         | balance read in a `useEffect` with no cancellation                | `no_stale_balance_inflight_switch`                                                                              |
| react `thin-both-auth-buttons`                | both buttons always rendered                                      | `auth_buttons`                                                                                                  |
| react `v3-mutation-retry-3`                   | `retry: 3`                                                        | `canister_err_not_resent`, `reject_code_{4,5}_not_resent`, `lost_reply_{not_resent,is_unknown,rereads_balance}` |
| react `v3-unknown-as-error`                   | every failure `error`, no re-read                                 | `reject_code_{4,5}_is_unknown`, `reject_code_5_rereads_balance`, `lost_reply_{is_unknown,rereads_balance}`      |
| react `v3-http-4xx-unknown`                   | a 4xx refusal shown as unknown                                    | `http_429_is_error`                                                                                             |
| react `v4-proto-retry-spread`                 | `{ ...mutationOptions(), retry: 3 }` (type-checks)                | as `v3-mutation-retry-3`                                                                                        |
| react `v4-proto-keep-previous-data`           | `{ ...queryOptions(), placeholderData: keepPreviousData }`        | `no_stale_balance_after_identity_switch`                                                                        |
| react `v4-proto-every-reject-unknown`         | every `rejected` shown as unknown                                 | `reject_code_{1,3}_is_error`                                                                                    |
| react `v4-proto-status-not-idle`              | no `idle` before the first transfer                               | `status_starts_idle`                                                                                            |
| react `v4-retry-spread`                       | `{ ...client.mutationOptions(), retry: 3 }` (type-checks)         | as `v3-mutation-retry-3`                                                                                        |
| react `v4-keep-previous-data`                 | `{ ...client.queryOptions(), placeholderData: keepPreviousData }` | `no_stale_balance_after_identity_switch`                                                                        |
| react `v4-every-reject-unknown`               | every `rejected` shown as unknown                                 | `reject_code_{1,3}_is_error`                                                                                    |
| react `v4-status-not-idle`                    | no `idle` before the first transfer                               | `status_starts_idle`                                                                                            |

Six of the seven `v4-` rows are the `v4-proto-` faulty solutions ported to
ic-reactor 4 (`conditions/v4/PORTING.md`): each fails exactly the tests its
original fails. `v4-anonymous-identity-sent` has no original: it is a trap
the real library opens where the prototype did not (only `"anonymous"`
refuses an update; an explicit `AnonymousIdentity` is signed and sent).

Some bugs fail more than one test because they break more than one stated
behaviour (a retry after a lost reply that succeeds also reports success and
double-debits); the requirement grouping keeps them from counting several
times in the requirement-level metrics.

## The two guides (v4-proto and thin-guide)

`conditions/v4-proto/docs/llms.txt` (1,778 words) and
`conditions/thin-guide/docs/llms.txt` (1,792 words) have the same ten sections
in the same order, the same example app, the same "Do not" list item for item,
and the same root-key and reject-code rules; where v4-proto does something for
the agent, the thin guide says how to do it by hand, and nothing else.
`node harness/check-docs.mjs` finds none of the 112 hidden-test needles (every
test name as written and spaced, every distinctive literal that the prompts of
**every** variant do not already make public — so a literal only the explicit
prompt states, such as `123456789012.34567891`, is a needle) in either guide,
in any condition's docs, or in the public scaffold, and no test name in any
prompt of either variant; a seeded file with three of them is caught.
Paraphrase was reviewed by hand. Its default list also holds
`conditions/v4/docs/llms.txt`, which `setup.mjs` checks the same way before
it copies the packed guide there.

## The v4-proto prototype

`conditions/v4-proto/lib` (~1,140 lines). Agents are shipped only what a
published package would ship — `package.json` + `dist/` — with neutral
comments: the implementation notes about candid-core workarounds now live in
`lib/SHIM-NOTES.md`, which never ships.

```ts
const client = createClient({ network, identity } | { network, auth })
const ledger = client.canister(LedgerService, { id })
ledger.icrc1_balance_of.queryOptions([account] | skipToken)   // reads only
ledger.icrc1_balance_of.certified([account])                   // plain queries only
ledger.icrc1_transfer.mutationOptions({ invalidates: [ledger.icrc1_balance_of] }) // writes only; no retry
await ledger.icrc1_transfer([arg])                              // direct call
handle.queryKey(args?) // ["ic-reactor", network, callerPrincipal, canisterId, method, "query", hex(encodeArgs)]
```

- Mode is in the handle's type (13 `@ts-expect-error` probes in
  `lib/test/types.test-d.ts`, each failing for its intended reason).
- One immutable `HttpAgent` per principal; the caller is in every key.
- `Ok`/`Err` unwraps; `Err` throws a typed `canister_err`.
- One error type with `mayHaveExecuted`: `rejected` is false only for codes 1
  and 3; `not_delivered` (code 2, HTTP 4xx other than 408) is the only kind
  a write retries on. A write while not signed in is refused before sending.
- A given `rootKey` is used; otherwise the key is fetched only from a local host.
- `mutationOptions` invalidates after success and after `mayHaveExecuted`.
- `lib/test/runtime.test.ts` (8 tests) checks the runtime on the fake replica.

What the types cannot stop: spreading the returned options and adding `retry`
or `placeholderData`.

### Shims over @candid-core/schema 0.2.0 (input to candid-core's design)

Also in `lib/SHIM-NOTES.md`, with file locations.

1. **Mode is not in any type.** `c.func` / `c.service` are non-generic and the
   service is typed `Schema<PrincipalValue>`; the emitted `Actor` type has
   signatures but no modes, so `defineService<Actor>()(schema, modes)` takes a
   hand-written mode map and checks it at load.
2. **Principals decode to a `{ toText }` carrier**; the prototype re-walks
   every value both ways and rewrites the types structurally (`Textify<T>`).
3. **No schema query or value map** ("does this schema mention a principal").
4. **`ActorError` has no stage** (encode vs decode is only in the message).
5. **`httpTransport.query` drops the reject code** into an `Error` message.
6. **`Transport` has no `AbortSignal`.**
7. **`unwrapResult` returns neither the arm schema nor the tag.**
8. **Generated type names collapse by structure** (`TransferArg.amount` is
   `BlockIndex`; the .did says `Tokens`).

## The v4 condition

ic-reactor 4 itself, for the 4.0.0-beta.1 gate (issue #786; DECISIONS Q14 in
#790; `PREREGISTRATION.md`, Addendum 3) and the GA gate (Addendum 4).
`setup.mjs` builds `@ic-reactor/core` and `@ic-reactor/react` from this
repository and packs them with `pnpm pack` (the default, `--v4-from tree`),
or downloads the published tarballs (`--v4-from npm:4.0.0-beta.1`: each must
have the `dist.integrity` pinned in `harness/ship.mjs`, which the registry
must still record); then it installs the tarballs with the pinned
dependencies as a flat npm install into `.ship/v4` (no workspace links),
records the source in `.ship/v4/source.json`, refuses the tree if
the core tarball's `llms.txt` or the packages' code gives a hidden test away,
copies that `llms.txt` into `conditions/v4/docs/` (the only doc the agent
gets), cuts both packages to `package.json` + `dist/`, and copies the result
to `conditions/v4/node_modules` for the scorer, so the hidden tests run
against what agents get. In the scorer's copy `@icp-sdk/core` (6.1.0 in
evals, the ship and the pin alike) links to evals' own, so the world and
the solution load one instance of it, as in every other condition
(`conditions/v4/README.md`). The starter's `src/generated/icrc1.ts` is
the output of the published `@candid-core/cli@0.2.0-beta.1`.

Status: the four references, the six ported faulty solutions and the
v4-only `v4-anonymous-identity-sent` are in the tree, written against the
client, its builders and the React bindings as built (IR2t #782, IR6 #780),
and `node gate.mjs --require v4` passes 56 of 56; `conditions/v4/PORTING.md`
records the port and where it differs from the plan. The guide is DX3's
(#785): 1,970 words at Addendum 3's commit, 1,974 as published in
4.0.0-beta.1 (sha256 `a07b846a…4342`). Addendum 3 was frozen on 2026-10-03
and its batch passed: `v4` safe in 5 of 5 runs on both tasks
(`results/2026-10-03-beta1-gate/`). Addendum 4 (the GA gate: the published
4.0.0-beta.1, 20 runs per cell, non-inferiority against `thin-guide`) is
drafted and not frozen; on the tree `--v4-from npm:4.0.0-beta.1` builds,
`node gate.mjs --require v4` passes 56 of 56.

## Leak audit and sandbox

Agents could read the hidden tests by absolute path, so:

- **Run directories.** Each run gets a private `work/ home/ tmp/` tree in a
  fresh 0700 batch directory under the OS temp dir (refused if inside the
  repository). `work/` holds the starter and a copy of `.ship/<condition>/node_modules`:
  a flat npm install with relative `.bin` links, no pnpm store paths, no
  `NODE_PATH` into the repository, no vitest caches, and the v4 package as
  `package.json` + `dist/` only. `setup.mjs` refuses to build a ship tree that
  contains the repository path or a hidden-test name.
- **OS sandbox** (`harness/sandbox.mjs`). Docker was the first choice, but no
  Docker daemon runs on this machine, so agents run under a macOS
  `sandbox-exec` profile: file contents under `/Users`, `/private/var/folders`,
  `/private/tmp` and `/Volumes` are unreadable and nothing outside the run is
  writable, except the run directory itself and the read-only toolchain (node
  installation, agent CLI, `--sandbox-allow` dirs). `harness/sandbox.test.mjs`
  (9 tests) builds a run exactly as the driver does and shows both
  directions: `npx tsc` and the public vitest smoke test pass inside; reading
  the repository's hidden tests, listing `evals/`, reading a sibling run of
  the batch, reading the scorer's directory, listing the home directory, and
  writing into the repository are all refused — each refusal paired with the
  same command succeeding outside the sandbox.
- **Agent isolation.** The agent gets only PATH and exactly one credential
  from the host (see "Authentication, limits and effort"); HOME,
  `CLAUDE_CONFIG_DIR` and TMPDIR point inside its run, so the host's
  `~/.claude` (settings, memory, MCP servers, login) is not visible.
  `--disallowedTools WebFetch,WebSearch` and `--strict-mcp-config` are passed;
  `--bare` is not (it does not read the OAuth token).
- **Transcript audit** (`harness/leak-scan.mjs`, second line). Every tool call
  in the stream-json transcript is checked: file/dir/glob fields and
  path-like shell words are normalised (`./../x`, `a/../..`, `$PWD`, `~user`,
  `$HOME`) and resolved from the shell's cwd (which `cd` moves); `$TMPDIR`,
  `$TMP`, `$TEMP`, `$OLDPWD`, unknown variables in a path and path-building
  command substitutions (`$(pwd)/..`, `$(dirname $PWD)`, `$(printf …)`) are
  flagged as unresolvable; the WebFetch and WebSearch tools are flagged, and
  so is network use from the shell (next item). Shell commands are
  lexed (quotes, operators, redirections, heredocs, here-strings) and each
  word judged by its position: a grep/rg/sed/awk/jq pattern, `node -e` /
  `python -c` program text and a heredoc fed to an interpreter are not paths
  (only their string literals naming `/Users`, `/private`, `/tmp`, `~` or a
  `..` climb are checked); a heredoc fed to a shell, `bash -c`, `xargs` and
  `$(…)` are scanned as commands. Each violation is judged on its own: one
  whose call failed, or whose output reports a permission refusal naming it,
  is an **attempt**; one that succeeded makes the run **contaminated**.
  `harness/leak-scan.test.mjs` (121 tests) covers each form, clean look-alikes
  (the first pilot's two false positives among them), evasions, and blocked
  vs successful. `drive.mjs --aggregate <dir> --rescan` re-audits stored
  transcripts with the current scanner and writes `summary.rescanned.json`
  beside the original.
- **The CLI's persisted tool output** (in the transcript audit, from
  `PREREGISTRATION.md` Addendum 5). When a tool's output is too large, the
  CLI saves it as
  `<run>/home/.claude/projects/<project>/<session>/tool-results/<file>` and
  answers the call with a `<persisted-output>` notice naming that path. A
  Read (`file_path`) or Grep (`path`) of exactly that path is not a
  violation when an earlier top-level user message is the CLI's answer to
  the call: its content is one tool_result whose whole content is that
  notice, naming the path byte for byte, and beside it the CLI's own record
  of the call (`tool_use_result.persistedOutputPath`) names the same path,
  in the message's own session (`session_id`). A tool's output cannot add
  that record, so a notice printed by a Bash command or returned by a
  subagent does not count. The notice must answer an earlier call that is
  not a Read and had no violation; the path as written has no `..`; the run
  directory is `<run>/work`; and no part of the path below `<run>` is a
  symlink, as far as it still exists. Anything else in the run's home
  (`.claude.json`, settings, session files), a path one segment off that
  shape, a Bash command naming the path (`cat <path>`) and any other tool
  or field naming it are violations, as before. The accepted reads of a
  call with no violation are listed in each run's audit record as
  `persistedReads`. The 37 tests of "the CLI's persisted tool output" take
  the accepted case from Addendum 4's batch
  (`results/2026-10-05-ga-gate/contaminated-run.json`) and refuse each
  departure from it.
- **Network from the shell** (in the transcript audit, the only line there).
  The sandbox leaves the network open: the agent CLI runs inside it and needs
  its API, and a profile cannot allow one host and deny the rest (`remote ip`
  takes only `*` or `localhost`). So `node`, which sandboxed agents may run,
  reaches any host (from inside the profile, `node -e` fetching a public URL
  succeeds). The audit flags: a network command (curl, wget, nc, ssh, …,
  also behind `env`, in `bash -c`, `xargs` or `$(…)`); a package manager or
  git command that reaches a registry or remote (`npm view`, `pnpm add`,
  `npx` of a package other than `tsc` and `vitest`, `pip install`,
  `git clone`, …); a URL of a non-local host given to an interpreter; and
  interpreter code that calls the network (`fetch(`, `http(s).get/request`,
  `net`/`tls`, WebSocket, `urllib`, `requests`, …) towards a non-local host
  or a host it does not name, or that runs a network command through
  `child_process` / `subprocess`. Interpreter code is `node -e` or
  `python -c`, a heredoc or pipe fed to an interpreter, and a script the run
  wrote (Write, Edit, a heredoc or `echo` into a file) and then runs with
  one. String literals are data: an edit script whose text holds `fetch(` or
  a URL is not network use, nor is code that names only local hosts
  (`localhost`, `127.*`, `[::1]`), nor source written to a file and not run.
  Not followed, so not seen: a test file run by vitest that fetches a URL
  (the public scaffold's fake replica answers IC API requests to any host,
  so the agent's own tests name mainnet hosts without reaching them, but
  other URLs pass through to the network), and a host reached through a
  library (an `HttpAgent` built with a mainnet host). Added after the
  pilots; re-auditing their 80 transcripts with it changes no record
  (`PREREGISTRATION.md`, Addendum 3).
- **Scoring after the batch.** The driver scores only after every agent run
  has ended, in `score.mjs`'s own 0700 directory.
- **Aggregation.** Contaminated runs are excluded from the main result and kept
  in an intent-to-treat result; both are reported with per-cell counts.

## Authentication, limits and effort

**Credential.** A real run needs one of, in this order of precedence:

1. `--oauth-token-file <path>` — a file holding a Claude subscription token
   made with `claude setup-token` (whitespace trimmed). The driver refuses a
   file that group or others can read or write (`chmod 600` it).
2. `CLAUDE_CODE_OAUTH_TOKEN` — the same kind of token, from the environment.
3. `ANTHROPIC_API_KEY` — API billing.

Exactly one reaches the agent: a subscription token is passed as
`CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` is then withheld even if
set (the CLI would otherwise prefer the key, and bill the API instead of the
subscription). The driver prints which kind is in use, never the value; the
kind (`oauth` / `api_key`) and its source are recorded in `plan.json`, in each
run record and, as counts, in the summary. The value never lands in anything
written to `runs/`: transcripts, logs, run records, error messages, the
summary and every file of a copied solution pass through redaction, which
removes every known credential value (an agent can read its own environment
and echo it). `harness/drive-auth.test.mjs` runs the driver with a stub agent
that dumps its environment into its transcript, its stderr and a solution
file, and checks that no fake credential value appears in any written file.
Neither set: the driver refuses to start and names all three options.

**Preflight.** Before any agent run, and alone with `--preflight`, the driver
makes one tiny call — `"Reply with the single word: ok"`, `--max-turns 1` —
in the same isolated environment and sandbox as a real run. Unless the CLI
returns a successful result that is not an error, it prints the CLI's result
text (redacted) and stops. (Implemented, not run by the harness author; it is
tested with a stub in place of the CLI.)

**Sign-in and limit errors are harness errors, never failed solutions.**
From measurements on CLI 2.1.285, a stream-json run ends with a `result`
message with `subtype`, `is_error`, `result`, `num_turns`, `usage`,
`total_cost_usd`, `api_error_status` and others; with no valid credential it
returns subtype `"success"`, `is_error: true`, result
`"Not logged in · Please run /login"`. The driver classifies an error result
(`is_error: true` or a non-success subtype), the CLI's stderr and top-level
`error` fields — never the agent's own prose, which in this task talks about
HTTP 429 constantly, and never a successful result:

- **sign-in** (`Not logged in`, `/login`, invalid key, expired token,
  `api_error_status` 401/403): the whole batch stops at once — every running
  agent is killed, nothing is recorded for them — with a message to fix the
  credential and `--resume`;
- **limit** (usage-limit wording such as `Claude AI usage limit reached|<epoch>`
  or `limit reached … resets`, `rate_limit_error`, `overloaded_error`,
  `api_error_status` 429/529): the run is retried after a backoff
  (`--rate-limit-backoff-min`, default 5, doubling; the reset time when the
  message gives one; capped by `--rate-limit-max-wait-min`, default 300), up
  to `--rate-limit-retries` (default 4); then it is excluded and counted as a
  `rate_limited` harness error. The attempts' transcripts are kept.

ASSUMED, not verified against real limit responses: the exact usage-limit
wording (taken from observed CLI messages) and that limits surface in these
fields. The sign-in shape above was measured.

**Parallelism on a subscription.** A subscription is rate-limited per
account, and parallel agents share it: use `--jobs 1` or `--jobs 2` (the
default is 2 when the credential is a subscription token, 4 with an API key).
Expect wall-clock time to grow accordingly (the pilot's 40 runs at ~12 min
each is ~4 h at 2 jobs).

**Effort.** `--effort <level>` is passed to the CLI (`--effort`), recorded in
each run and counted in the summary. Effort levels, like models, are never
pooled: cells are task × model × effort × prompt × condition and
comparisons stay within one.

## Measured vs not measured

Measured, per run: tsc-clean; which hidden tests and requirements pass; the
agent's exit (normal / max_turns / timeout / error / no_result), turns,
tokens, cost and minutes; contamination and leak attempts. Aggregated per
task × model × effort × prompt variant × condition (never pooling models,
effort levels or prompt variants; comparing only within one of each):

- **primary**: fraction of runs with zero safety-requirement violations, with
  Wilson intervals, and the risk difference between conditions with Newcombe's
  hybrid-score interval (checked against Newcombe 1998's worked example);
  the same difference pooled over the tasks is reported beside it
  (`pooled` in the summary: safe runs and runs summed per condition, within
  one model, effort level and prompt variant), deciding nothing unless an
  addendum says so (Addendum 4's alternative A);
- **secondary**: mean fraction of requirements met (bootstrap intervals);
- tsc-clean rate, full-pass rate, per-requirement pass rates alongside.

Harness errors are retried, then excluded and counted, never scored as 0.
`--pilot` (5 runs per cell) adds observed variance, minutes/turns/tokens per
run, ceiling/floor warnings, and runs per cell needed for `--margin`.

Not measured: code quality or idiom; performance; behaviour against a real
replica or boundary node (202/polling, SysUnknown, rate limits, delegation
expiry); certified-query paths; the `not_delivered` retry path's _value_
(a retry after code 2 or 429 is allowed, not required); subaccounts.

## Threats to validity

- **Author bias.** One person wrote the tasks, prompts, tests, prototype, both
  guides and all references. Every requirement is in the prompt for every
  condition; an independent reviewer has been through it once.
- **Training-data familiarity.** ic-reactor v3 and TanStack Query are public
  and may be in a model's training data; v4-proto is new. That favours v3
  (familiar API) and could favour or hurt v4-proto (no priors, but also no
  wrong priors). It cannot be removed, only noted per model.
- **v4-proto's typed service file is hand-written.**
  `src/generated/icrc1.service.ts` stands in for codegen that does not exist
  yet (a generic `c.service` would let the generator emit it). Agents do not
  write it, and its header no longer says it is a stand-in; if real codegen
  differs, so may results.
- **Feedback channel.** In sandboxed mode every condition gets the same
  runnable scaffold, which removes the old tsc-only asymmetry that favoured
  the typed condition. It also lets agents test their own code, which a
  real developer could do. In tsc-only mode that asymmetry returns.
- **Sandbox limits.** macOS only; Docker path absent. File metadata (names,
  existence) outside the run stays visible; network is open (the agent needs
  its API), so network use from the shell is caught only by the transcript
  audit, and not when a test file run by vitest fetches. The profile has
  been tested with node, tsc and vitest, not yet with the real agent CLI,
  which may need extra read-only paths (`--sandbox-allow`).
- **Shipped vs scored packages.** Agents get a flat npm install; scoring uses
  the pnpm install. Direct dependencies are pinned to the same versions;
  transitive versions may differ.
- **Docs.** thin-guide and v4-proto guides are matched; v3's docs are its own,
  as published (~9,000 words). A guide written by someone else might score
  differently.
- **Helpers differ.** v3 ships token parse/format helpers; the others do not.
- **The explicit prompts teach the reject and root-key rules**, so under them
  the experiment measures whether agents apply the rules, not whether they
  know them; the first pilot was at the ceiling in every cell. The minimal
  prompts leave the rules out, so there the library and its docs are the only
  source of them; the contract comments in the starter still say that an
  absent or anonymous identity is read-only and that the root key is for a
  local replica.
- **Fake replica.** Signatures, certificates and routing are real; timing,
  boundary nodes and SysUnknown are not. The fake answers a missing method
  with code 3; a real replica's code for that case is an implementation
  detail.
- **Timing-based tests.** "Not re-sent" waits 2.5 s (TanStack's first retry is
  at 1 s); the stale-balance tests delay reads by 400–1,200 ms and sample every
  5 ms. The gate has been run repeatedly at 4 and 6 parallel jobs without a
  flake, which is not proof of none.
- **Dependent tests.** Some bugs fail several tests in one requirement or
  across two (see the table); requirement-level metrics absorb most of it.
- **One ledger, two tasks.** Results may not transfer to other canister shapes.

## Owner decisions before the matrix can run

- **Runs per cell.** 8 cells (2 tasks × 4 conditions) per model. Run the pilot
  first (`--pilot`, 40 runs per model): it reports the observed safe rates and
  the runs per cell needed for the pre-registered margin. As a guide: a
  risk difference of 0.10 around safe rates near 0.8 needs ≈ 250 runs per cell
  at 80% power; a difference of 0.20 needs ≈ 60. Plan for a large effect
  or accept wide intervals.
- **The margin that decides "build v4".** Pre-register it on the primary
  metric against the honest comparator, e.g. v4-proto − thin-guide ≥ 0.15 in
  the safe-run rate with the Newcombe 95% interval above 0 on both tasks, and
  v4-proto not worse than v3 by more than 0.05.
- **Models.** At least one frontier and one smaller model; never pooled.
- **Platform and auth.** macOS with `sandbox-exec` (or accept tsc-only mode),
  the Claude Code CLI on PATH, and a credential: a subscription token
  (`claude setup-token`, then `--oauth-token-file` or
  `CLAUDE_CODE_OAUTH_TOKEN`) with `--jobs 1`–`2`, or an `ANTHROPIC_API_KEY`.
  Run `node drive.mjs --preflight --model <m> [--effort <e>] --oauth-token-file <f>`
  first.
- **Effort level(s).** Each level is its own set of cells.
- **Estimated cost.** 8 cells × N runs × ~12 min per model (a guess; the pilot
  measures it): pilot ≈ 8 agent-hours; N = 20 → 32; N = 60 → 96; plus ~2 min
  of scoring per run.
- **Prompt variant.** Which variant the full matrix uses, after the
  second pilot (`--prompt minimal`; `PREREGISTRATION.md`, Addendum 1).
