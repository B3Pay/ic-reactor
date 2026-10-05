# Pre-registration

Recorded on 2026-09-30, before any agent run. Do not edit after the first run
starts; add a dated addendum instead.

## Question

Do AI coding agents write safer Internet Computer code with the typed handle
layer (`v4-proto`) than with a generated module, raw TanStack Query and an
equally good guide (`thin-guide`)?

## Decision rule

Build the handle layer only if, for the full matrix, on **both** tasks
(`node-tool` and `react-wallet`):

1. the safe-run rate of `v4-proto` minus that of `thin-guide` is at least
   **0.15**, and
2. the lower bound of the 95% Newcombe interval on that difference is above 0.

Anything else, including an ambiguous result or both arms near the ceiling,
means the handle layer is not built and the thin layer ships.

## Definitions

- **Safe-run rate**: the fraction of runs with zero violations of a
  safety-marked requirement in `tasks/<task>/task.json`, as computed by
  `score.mjs` and `harness/aggregate.mjs`.
- **Main analysis** excludes contaminated runs. The intent-to-treat result
  (contaminated runs kept) is reported beside it. If the two disagree on the
  decision rule, the result is ambiguous.
- Comparisons are within one task and one model. Models are never pooled. With
  more than one model, the rule must hold for each model.
- Secondary, reported but not decisive: mean requirements met, `tsc`-clean
  rate, `thin-guide` minus `thin` (the documentation effect), and `v3`.

## Pilot

- Model: `claude-sonnet-5-5`. 5 runs per cell, 8 cells, 40 runs, seed 1.
- Purpose: measure variance, minutes, turns and cost per run, check for ceiling
  or floor effects, and confirm the sandbox and driver work with the real CLI.
- The pilot does not decide the question. Its runs are not pooled into the full
  matrix.
- The full matrix size is chosen after the pilot, from the runs per cell it
  reports for a margin of 0.15.

## Known limits

See "Threats to validity" in `README.md`. In particular: one author wrote the
tasks, tests, prototype, guides and reference solutions; the prototype's typed
service file is hand-written, standing in for code generation that does not
exist yet; and `v3` is in model training data while the other stacks are not.

## Addendum 1 — 2026-09-30

Added after the first pilot, before any further agent run. The text above is
unchanged.

**First pilot result.** `claude-sonnet-5-5`, effort `medium`, 5 runs per cell,
8 cells, 40 runs, seed 1, sandboxed mode, `--jobs 2`, with the task prompts
as they stood (`tasks/<task>/prompt.md`, now called the `explicit` prompt
variant). Every cell was at the ceiling: 5 of 5 runs safe (Wilson 95%
[0.566, 1]), mean requirements met 1, `tsc`-clean 1; every difference 0
(Newcombe 95% [-0.434, 0.434]); no harness errors. The explicit prompt states
every safety rule the hidden tests check, so the pilot measured whether agents
follow stated rules, which all four conditions do. No margin can be detected
from there. Results: `runs/2026-09-30T14-22-05-924Z/`.

**Contamination audit.** At run time the transcript audit marked 2 of the 40
runs contaminated (both `react-wallet` / `thin`). Both were false positives:
the scanner read grep patterns and program source (`node -e`, heredocs) as
file paths. The scanner now parses shell commands, treats patterns and
program text as such, and marks a run contaminated only for an outside read
that succeeded. Re-audited from the stored transcripts
(`drive.mjs --aggregate <dir> --rescan`), 0 of 40 are contaminated; the
original records are kept, the re-audit is written beside them
(`summary.rescanned.json`, `pilot.rescanned.json`). The conclusion above holds
under both.

**Second pilot.** Same model (`claude-sonnet-5-5`), same effort (`medium`),
same 5 runs per cell, 8 cells, seed 1, same hidden tests, scoring, margin
(0.15) and decision rule, with the `minimal` prompt variant
(`tasks/<task>/prompt.minimal.md`, `drive.mjs --prompt minimal`): the product
and its public contract (signatures, result shape, DOM test ids and states,
config inputs, and the neutral meaning of `mayHaveExecuted` and of the
`unknown` state), without the safety rules. Conditions still differ only in
the library line; condition docs are unchanged.

- The prompt variant is recorded in every run record and is part of every
  cell: variants are never pooled, and comparisons are made only within one
  variant, as for models and effort levels.
- The second pilot, like the first, does not decide the question; its runs
  are not pooled into the full matrix.
- Which variant the full matrix uses, and its runs per cell, are chosen after
  the second pilot and recorded in a further dated addendum before the full
  matrix starts.

Approved by owner: yes, on 2026-09-30, before the second pilot started ("run the second pilot with the minimal prompt").

## Addendum 2 — 2026-09-30

Added after the second pilot, before any further agent run. The text above,
including Addendum 1, is unchanged.

**Second pilot, as scored at run time.** `claude-sonnet-5-5`, effort
`medium`, `--prompt minimal`, 5 runs per cell, 8 cells, 40 runs, seed 1,
sandboxed, `--jobs 2`; results in `runs/2026-09-30T15-48-23-343Z/`, log
`runs-pilot2.log`. No harness errors, no contaminated runs. The safe-run
rate was 0 of 5 in every cell (Wilson 95% [0, 0.434]), because
`input_validation` failed in 39 of 40 runs through a single test,
`refuses_invalid_amount`. Everything else: `basic_function`, `exactness`,
`no_anonymous_send`, `no_resend`, `root_key_trust` and (react-wallet)
`no_stale_balance` passed in 5 of 5 runs in every cell; `outcome_classification`
passed 5 of 5 for `thin-guide` and `v4-proto` and 0 of 5 for `thin` and `v3`,
on both tasks.

**Diagnosis.** Every stored solution was re-run offline against each amount
input of that test (`harness/probes/probe.mjs`). All 40 refused `-1`, `abc`,
`""`, `1e3` and `1.123456789` (9 fraction digits) without contacting the
ledger. 39 of 40 sent both amounts past nat64 (2^64 base units and
99999999999999999999 tokens) to the ledger; only node-tool / `thin` run 003
refused them. So the test failed on one rule only: the nat64 cap.

- The nat64 cap is stated only by the explicit prompt. The ledger's `amount`
  is Candid `nat` (`harness/icrc1.did`: `type Tokens = nat`); no condition's
  library, docs or starter mentions a cap (the guides mention `nat64` only in
  their type-mapping tables), and the minimal prompt does not. Under the
  minimal prompt no agent in any condition could know it.
- Refusing more than 8 fraction digits, rather than rounding or truncating:
  `v3`'s docs state it (`parseTokenAmount` throws a `RangeError` for more
  fraction digits than the token has); in `thin`, `thin-guide` and `v4-proto`
  nothing states it, but the minimal prompt defines the amount as whole
  tokens with 8 decimals (`"1.5"` is 150000000 base units), so a ninth digit
  has no exact base-unit value and any rounding sends an amount the user did
  not write. It is kept applicable under both variants. All 40 runs refused
  it, so excluding it too would not change this pilot's result.

**The change.** `refuses_invalid_amount` is split into three tests in the
same `input_validation` requirement, on both tasks: `refuses_malformed_amount`
(`-1`, `abc`, `""`, `1e3`), `refuses_excess_fraction_digits` (`1.123456789`)
and `refuses_amount_past_nat64` (2^64 base units; 99999999999999999999). In
`task.json`, `notApplicable.minimal` lists `refuses_amount_past_nat64`: under
the minimal prompt it runs and is reported with its result, but counts
toward no requirement, safe-run rate or requirements met; under the explicit
prompt it counts as before. Two further changes came with the split: the
react-wallet test now uses the same seven inputs as node-tool (it used
three), and the refusal tests judge only transfers sent to their own
recipient, because a mutant's background retry of an earlier test's
transfer was otherwise blamed on them. Six new faulty solutions (one per new
test per task) are in the gate, which passes 45 of 45.

**Re-scored result** (`drive.mjs --aggregate <dir> --rescore`: the stored
solutions, the current tests, no agent launched; the run-time records are
kept). Second pilot, minimal prompt:

| Task         | Condition  | Safe-run rate (95% CI) | Requirements that failed   |
| ------------ | ---------- | ---------------------- | -------------------------- |
| node-tool    | v3         | 0/5 [0, 0.434]         | outcome_classification 0/5 |
| node-tool    | thin       | 0/5 [0, 0.434]         | outcome_classification 0/5 |
| node-tool    | thin-guide | 5/5 [0.566, 1]         | none                       |
| node-tool    | v4-proto   | 5/5 [0.566, 1]         | none                       |
| react-wallet | v3         | 0/5 [0, 0.434]         | outcome_classification 0/5 |
| react-wallet | thin       | 0/5 [0, 0.434]         | outcome_classification 0/5 |
| react-wallet | thin-guide | 5/5 [0.566, 1]         | none                       |
| react-wallet | v4-proto   | 5/5 [0.566, 1]         | none                       |

Every other requirement passed 5 of 5 in every cell. The not-applicable
`refuses_amount_past_nat64` passed 1 of 20 runs on node-tool and 0 of 20 on
react-wallet. Differences in the safe-run rate (Newcombe 95%), on both tasks:
`v4-proto − thin-guide` 0 [-0.434, 0.434]; `thin-guide − thin` 1
[0.386, 1]. The failures in `thin` and `v3` are reject-code and HTTP 429
classification (for example `http_429_classified` / `http_429_is_error` in
5 of 5 runs of each).

The first pilot (explicit prompt), re-scored the same way, is unchanged: 40
of 40 runs pass every test, including the three new ones; every cell 5 of 5
safe; every test result identical to the run-time scoring.

**This change was made after seeing the second pilot's data (post hoc).**
Why it is defensible:

- It removes, only under the variant that never states it, a rule that no
  agent in any condition could know. It failed the same way in every
  condition, so it carried no information about the conditions and pinned
  every cell at the floor.
- It applies to all conditions alike. The explicit variant is scored as
  before, and the first pilot's result does not move. The question, decision
  rule, margin, primary metric and definitions are unchanged.

What it does not cure:

- Which rules count as knowable was decided with the results in view. The
  one borderline case (the 9th fraction digit) was resolved in the stricter
  direction, and it made no difference here.
- The separation now visible (`thin-guide` and `v4-proto` above `thin` and
  `v3`) comes from `outcome_classification`, which the split did not touch.
  It only became visible because of the split, so it is exploratory until a
  new run confirms it.
- On the pre-registered comparison, `v4-proto − thin-guide`, the second
  pilot is again at the ceiling on both tasks.
- The pilot still does not decide the question. The split, the test code and
  the `notApplicable` list are fixed from now on, before any further agent
  run; any further change needs another dated addendum.

Approved by owner: yes, on 2026-09-30 ("approve addendum 2").

## Decision — 2026-09-30

Recorded after the second pilot was re-scored under Addendum 2, before any
further agent run.

**Outcome.** The owner stopped the experiment here. No full matrix is run.
The handle layer (`v4-proto`) is not built; ic-reactor 4 ships the thin layer:
a client, caller-scoped keys, one error union with "may have executed", a
"may have executed" classifier, strict units helpers, a test client, the
provider and `useAuth`, and a guide of the quality used in the `thin-guide`
condition.

**Basis.** Two pilots (explicit and minimal prompts, `claude-sonnet-5-5`,
effort `medium`, 5 runs per cell) gave `v4-proto` and `thin-guide` identical
results in every cell: 5 of 5 safe on both tasks under both prompts, with zero
variance, so the pre-registered difference is 0 [-0.434, 0.434] on both
tasks. Under the minimal prompt `thin-guide - thin` is 1 [0.386, 1] on both
tasks; the gap is entirely `outcome_classification`. The pilots do not decide
the question under the pre-registered rule; the decision is the owner's, made
on the grounds that two pilots showed no sign of the 0.15 margin and that the
full matrix (about 41 runs per cell) would spend usage to confirm a null.

**Standing.** The `thin-guide - thin` effect is exploratory (it became
visible only after the post-hoc split in Addendum 2) and rests on n = 5 per
cell, one model, one effort level, and guides and tests written by one author.
It is carried as a product lesson, not as a measured claim.

Approved by owner: yes, on 2026-09-30 ("stop here, ship the thin layer").

## Addendum 3 — the 4.0.0-beta.1 gate

**Status: Frozen on 2026-10-03, before any agent run of the `v4` condition.**
Drafted on 2026-10-02. The text above, including Addenda 1 and 2 and the
Decision, is unchanged. From here it changes only through a further dated
addendum.

**What it decides.** Not whether to build anything (the Decision above
settled that), but whether ic-reactor 4 as packed may be released as
4.0.0-beta.1: DECISIONS Q14 in issue #790, settled by the owner on
2026-09-30. The question is whether the real packages keep the second
pilot's `thin-guide` result: every run safe on both tasks under the minimal
prompt.

**Conditions.**

- `v4`: `@ic-reactor/core` and `@ic-reactor/react` built and packed from the
  `v4` branch at the commit under test, `@candid-core/schema` 0.3.0-beta.1,
  the module `@candid-core/cli` 0.2.0-beta.1 generates, and the core
  tarball's `llms.txt` (DX3's guide, issue #785) as the only documentation
  (`conditions/v4/README.md`). `node setup.mjs` builds it from that commit.
- `thin-guide`: unchanged since the pilots (starter, dependencies, docs),
  re-run in the same batch as a same-day control: same model, effort, prompt
  and harness.

**The commit under test** is `1ff26e511c89ced4c980814b0d53f09d931ab1b0`
(branch `slice/dx5-run`: the `v4` branch with DX5 phase B, #807, and DX3,
#808, merged; `packages/**` there is what those two pull requests merge into
`v4`). `.ship/v4` built from it holds `@ic-reactor/core` 4.0.0-alpha.0,
`@ic-reactor/react` 4.0.0-alpha.0 and `@candid-core/schema` 0.3.0-beta.1, and
`conditions/v4/docs/llms.txt` is byte-identical to that commit's
`packages/core/llms.txt` (1,970 words; `harness/check-docs.mjs`: 0 of 112
needles). `node gate.mjs --require v4` on the same tree: 56 of 56. The
versions are written into `results/README.md` with the results.

**Fixed from the earlier addenda, unchanged.** The two tasks (`node-tool`,
`react-wallet`), their hidden tests, the world, `task.json` (including
`notApplicable.minimal`: `refuses_amount_past_nat64`), `score.mjs`,
`harness/judge.mjs`, and the leak audit as of Addendum 2 plus its network
check (next paragraph), which leaves every path judgement as it was. The
prompts differ across conditions only in the `{{LIBRARY}}` line
(`harness/assemble.test.mjs` checks it for every condition, `v4` included).

**Harness changes since Addendum 2.** The harness came to this branch
unchanged from the one the pilots ran on (`spike/v4-thesis` at 2bc1c17f7).
Besides adding the `v4` condition (above) and `gate.mjs --require` (pass
rule 2, below), these changed since, none of them in the hidden tests, the
world, `task.json`, `score.mjs` or `harness/judge.mjs`:

- `drive.mjs --resume` scores a run it runs again after a harness error.
  Before, the run kept its harness-error record and the new attempt was
  never scored.
- `drive.mjs` refuses to start a new batch in an `--out` directory that
  already holds files. It would have taken the runs recorded there for its
  own: an `agent.json` as run, a `score.json` as scored.
- The leak audit flags network use from the shell, not only the WebFetch
  and WebSearch tools. The sandbox leaves the network open (the agent CLI
  inside it needs its API, and a profile cannot allow one host), and
  sandboxed agents may run `node`, so `node -e "fetch(…)"` could read, for
  example, the published ic-reactor 3 guide and still count in the main
  analysis. It now flags network commands (curl, wget, …), package-manager
  and git commands that reach a registry or remote, a non-local URL given
  to an interpreter, and interpreter code (`node -e`, a heredoc or pipe
  into `node`, a script the run wrote and then runs) that calls the network
  towards a non-local host or one it does not name (`README.md`, "Leak
  audit and sandbox"). Such a call that ran makes the run contaminated, as
  an outside read does; one the CLI refused or that failed is an attempt.
  A test file run by vitest that fetches is still not seen. Re-audited with
  it, all 80 pilot transcripts keep their audit record exactly (no network
  use found; 0 of 40 contaminated in each pilot, as reported in Addendum 1
  and Addendum 2).
- `gate.mjs --root <dir>` reads the solutions from another tree's
  `tasks/`, for the harness's own test that `--require` fails the gate
  before scoring anything when a required cell is empty
  (`harness/gate-plan.test.mjs` runs the gate on a seeded tree; with the
  `v4` references in this tree, that path could no longer be run here). The
  gate this addendum runs takes no `--root`.
- The `v4` cells of the gate are filled: a `reference` and a
  `reference-module-scope` for each task, written against the packed
  packages, and the six v4-proto faulty solutions ported to them
  (`tasks/*/faulty/v4-*`). Each port fails exactly the tests its v4-proto
  original fails, so no `expectFail` list changed and none was dropped
  (`conditions/v4/PORTING.md`). One faulty solution has no original:
  `node-tool/faulty/v4-anonymous-identity-sent` passes the configured
  identity through (`identity: config.identity ?? "anonymous"`), so an
  explicit `AnonymousIdentity` is signed and sent, a trap the real library
  opens where v4-proto did not; it fails exactly `no_anonymous_update`.
  `harness/gate-plan.test.mjs` now checks on this tree that the gate skips
  no cell, with `--require v4` and without, that it plans those four
  references, six ports and the one `v4`-only solution, and that each port
  expects what its original expects.

**Design.**

- Prompt: `minimal` (`tasks/<task>/prompt.minimal.md`); run mode
  `sandboxed`.
- Cells: 2 tasks × 2 conditions = 4 cells, 5 runs per cell, 20 runs, in one
  batch, ordered round-robin in a shuffle seeded 1 (so the two conditions
  interleave in time).
- Model `claude-sonnet-5-5` at effort `medium`, as in both pilots. `drive.mjs`
  passes them to the agent CLI as `--model claude-sonnet-5-5 --effort medium`
  (`DEFAULT_AGENT_CMD`) and records both in `plan.json` and every run record.
- Commands, from `evals/` on the commit under test:

  ```bash
  node setup.mjs
  node gate.mjs --require v4    # must pass first: pass rule 2
  node drive.mjs --preflight --model claude-sonnet-5-5 --effort medium \
    --oauth-token-file <file>
  node drive.mjs --pilot --prompt minimal \
    --condition v4 --condition thin-guide \
    --model claude-sonnet-5-5 --effort medium --seed 1 --jobs 2 \
    --margin 0.1 --oauth-token-file <file>
  ```

  `--pilot` sets 5 runs per cell. Defaults that stay as in the pilots:
  `--mode sandboxed`, `--timeout-min 30`, `--max-turns 60`, `--retries 2`
  and the rate-limit settings. `--margin 0.1` only sizes the GA run (the
  runs per cell for a 0.10 difference); it decides nothing here.

- Rehearsed on 2026-10-02 with `--dry-run` (the batch command above without
  `--jobs`, `--margin` and the token file; nothing launched): 4 cells, 20
  runs, 5 per cell, in a shuffle seeded 1 that begins
  `react-wallet/thin-guide#1`, `node-tool/thin-guide#1`, `node-tool/v4#1`,
  `react-wallet/v4#1`, `node-tool/thin-guide#2`, `node-tool/v4#2`,
  `react-wallet/v4#2`, `react-wallet/thin-guide#2`; each `v4` cell's
  `docs/` is `llms.txt` only, and each `thin-guide` cell's is the two
  candid-core READMEs and `llms.txt`, as in the pilots.

**Pass rule.** 4.0.0-beta.1 passes this gate only if both hold:

1. **`v4` is safe in 5 of 5 runs on `node-tool` and in 5 of 5 on
   `react-wallet`**, in the main analysis and in the intent-to-treat
   analysis alike. "Safe" is as `score.mjs` and `harness/judge.mjs` compute
   it under the minimal prompt (no applicable safety requirement failed).
   Each `v4` cell must hold 5 scored runs, none contaminated: a cell with a
   contaminated run, or with fewer than 5 scored runs once `drive.mjs` has
   exhausted its retries, does not meet the rule.
2. **`node gate.mjs` passes on the commit under test, with `v4` in it**: the
   `v4` `reference` and `reference-module-scope` of both tasks pass every
   hidden test with a clean `tsc`; the six v4-proto faulty solutions,
   ported (`conditions/v4/PORTING.md`: from `v4-proto-never-may-have-executed`,
   `v4-proto-refuses-nat64-max`, `v4-proto-retry-spread`,
   `v4-proto-keep-previous-data`, `v4-proto-every-reject-unknown` and
   `v4-proto-status-not-idle`), and `v4`'s own
   `node-tool/faulty/v4-anonymous-identity-sent` each fail exactly the tests
   in their `meta.json`: 56 of 56, no cell skipped. `--require v4` makes the
   gate fail, before scoring anything, when a `v4` cell has no reference
   solution, so "no cell skipped" is the gate's exit status and not a
   reading of its output (an empty cell of the pilots' four conditions, or
   one whose task holds faulty solutions of its condition, fails it too).
   It is run before the batch; if it fails, the batch does not start.

`thin-guide` does not enter the rule. Its result is reported beside `v4`'s;
if it is below 5 of 5 on a task, the report says so, because the pilots'
baseline then did not reproduce on that day.

**Analyses**, as the Definitions and Addenda 1 and 2 define them:

- Main: contaminated runs excluded. Intent-to-treat: contaminated runs kept.
  Both from the same `summary.json` (`main`, `intentToTreat`), with
  contamination as the leak audit judged it at run time. A later re-audit
  (`--rescan`) is reported beside it and does not change the outcome
  without a further addendum.
- Harness errors are retried by the driver, then excluded and counted, never
  scored as 0. Completing a planned run that ended in a harness error
  (`drive.mjs --resume <dir>`) completes the batch; a scored run is never
  replaced.
- Reported for each cell: the safe-run rate with its Wilson 95% interval,
  per-requirement pass rates, mean requirements met, `tsc`-clean rate, the
  not-applicable `refuses_amount_past_nat64` results, minutes, turns and
  tokens. Reported for each task: `v4 - thin-guide` in the safe-run rate
  with its Newcombe 95% interval (`harness/aggregate.mjs` computes this
  comparison first). None of these decides the gate; rule 1 does.

**If it fails.** If rule 1 or rule 2 is not met, 4.0.0-beta.1 is not
released on this batch. The batch, or any cell of it, is not run again to
look for a pass. The failing runs and requirements are reported, and the
owner decides what follows: for example a change to the library or its
guide, followed by a new batch pre-registered in a further dated addendum,
or a release that states the result. Any change to the hidden tests, the
world, the scoring, the prompts or this rule after the batch starts needs a
dated addendum and the owner's approval, as Addendum 2 did.

**Known limits.**

- Five runs per cell: 5 of 5 has a Wilson 95% interval of [0.566, 1]. The
  gate can catch a gross regression; it cannot show equivalence. GA uses
  20 runs per cell and non-inferiority, `v4 - thin-guide >= -0.10` on the
  Newcombe lower bound, pre-registered in a further addendum before that
  run (Q14).
- One model at one effort level; the pilots' caveats hold (one author wrote
  the tasks, tests, guides and references; the separation from `thin` is
  exploratory).
- The world still installs the fake replica that `@ic-reactor/core` 3.13.0
  publishes as a global `fetch` stub before the solution loads; a v4 client
  builds its agents after that and binds the stub like any `HttpAgent`
  (issue #786). The scorer's `v4` install is the ship's except
  `@icp-sdk/core`, a link to evals' own copy of the same version, so the
  world and the solution load one instance of it, as in every other
  condition (`conditions/v4/README.md`; `harness/ship.test.mjs` checks it).
- The react-wallet starter's `WalletAuth` is not an `AuthLike`; the agent
  writes the adapter the guide shows (Q14). How well the guide teaches it,
  and that an explicit `AnonymousIdentity` is sent while
  `identity: "anonymous"` is not (`conditions/v4/PORTING.md`; the gate's
  `v4-anonymous-identity-sent` shows the hidden tests catch it), is part of
  what the batch measures. So is a third trap the port found: a client kept
  at module scope and handed to `ReactorProvider` type-checks, and is
  disposed when the first tree unmounts, after which every call of every
  later tree is cancelled (in the hidden tests, 30 of 32 failed;
  `conditions/v4/PORTING.md`, react-wallet module-scope variant). #805 (IR6)
  since makes the provider borrow, and never dispose, a client created before
  its factory runs; a client created lazily inside the factory
  (`shared ??= createClient(...)`) is still owned by the first provider, and
  the provider logs a development error when a later tree is handed it.
- `refuses_excess_fraction_digits` sends a nonzero ninth fraction digit.
  `parseUnits` treats zeros past the decimals as insignificant
  (`"1.000000000"` at 8 is 1 token, by design, #777), so a solution that
  relies on it accepts `"1.123456780"`, which the explicit prompt's "more than
  8 fraction digits" would refuse. No hidden test sends such an amount, and
  the hidden tests are fixed for this gate, so it is not scored; the v4
  references count the raw fraction digits as well, as the explicit prompt
  reads.

**Freezing.** This addendum is frozen, by replacing its status line with the
date and recording the owner's approval below, when all of these hold:
the `v4` references, the six ported faulty solutions and
`v4-anonymous-identity-sent` are in the tree and
`node gate.mjs --require v4` passes 56 of 56; `conditions/v4/docs/llms.txt`
is DX3's guide as packed and passes `node harness/check-docs.mjs`; the
commit under test is named above.

Approved by owner: yes, on 2026-10-02, as the goal of the session that built
4.0.0-beta.1 ("The eval gate passes on the real packages: the harness's `v4`
condition, minimal prompt, both tasks, 5 runs each on Sonnet 5.5 at medium
effort, 5 of 5 safe, and `gate.mjs` green"; "Run agent evals on my
subscription with Sonnet 5.5 at medium effort, up to 60 runs in total"),
which is this addendum's design (DECISIONS Q14); frozen by the lead on
2026-10-03, with the conditions under "Freezing" met.

## Result of Addendum 3 — 2026-10-03

Recorded after the batch; Addendum 3 itself is unchanged. The batch ran as
pre-registered on the commit under test (`1ff26e511`): 20 runs, 4 cells of
5, `claude-sonnet-5-5` at effort `medium`, minimal prompt, sandboxed, seed 1,
2 agents at a time, with a passing preflight. Results:
`results/2026-10-03-beta1-gate/` (from `runs/beta1-gate-2026-10-03/`).

| Task         | Condition    | Safe (main) | Safe (ITT) | Requirements met | Contaminated | Harness errors |
| ------------ | ------------ | ----------- | ---------- | ---------------- | ------------ | -------------- |
| node-tool    | `v4`         | 5 of 5      | 5 of 5     | 1.00             | 0            | 0              |
| node-tool    | `thin-guide` | 5 of 5      | 5 of 5     | 1.00             | 0            | 0              |
| react-wallet | `v4`         | 5 of 5      | 5 of 5     | 1.00             | 0            | 0              |
| react-wallet | `thin-guide` | 5 of 5      | 5 of 5     | 1.00             | 0            | 0              |

Each 5 of 5 has a Wilson 95% interval of [0.566, 1]; `v4 - thin-guide` is 0
on both tasks (Newcombe [-0.434, 0.434]). Every run exited normally and
passed `tsc`; the leak audit, with its network check, found nothing.
`refuses_amount_past_nat64` stays not applicable under the minimal prompt
(observed: node-tool 1 of 10, react-wallet 0 of 10, all conditions).

**Pass rule.** Rule 1 holds: `v4` is safe in 5 of 5 runs on `node-tool`
and on `react-wallet`, in the main analysis and the intent-to-treat analysis
alike, with 5 scored, uncontaminated runs per cell. Rule 2 holds: `node
gate.mjs --require v4` on the same tree, 56 of 56. **4.0.0-beta.1 passes
this gate.**

The caveats of "Known limits" apply: five runs per cell can catch a gross
regression, not show equivalence; GA's gate is 20 runs per cell and a
non-inferiority bound, pre-registered first (Q14).

## Addendum 4 — the 4.0.0 GA gate

**Status: Frozen on 2026-10-05, before any agent run of its design.** The
text above, including Addenda 1 to 3, the Decision and the Result of
Addendum 3, is unchanged.
Until this addendum is frozen no agent run of its design may start; after
it is frozen it changes only through a further dated addendum.

**What it decides.** Whether the eval side of the 4.0.0 GA gate is met:
DECISIONS Q14 in issue #790, settled by the owner on 2026-09-30 ("GA: 20 runs
per cell, non-inferiority `v4 − thin-guide ≥ −0.10` (Newcombe lower bound),
pre-registered in a new addendum before the run"). The question is whether
the published ic-reactor 4 packages are no worse than the `thin-guide`
control, by more than 0.10 in the safe-run rate under the minimal prompt.
It does not decide the GA exit criteria outside `evals/` (examples, docs,
e2e), and it makes no claim that `v4` is better than the control.

**Conditions.**

- `v4`: the packages **as published on npm**, not packed from a tree:
  `@ic-reactor/core@4.0.0-beta.1` and `@ic-reactor/react@4.0.0-beta.1`
  (exact versions, published on 2026-10-03 under the `beta` dist-tag by the
  release workflow, which runs on the tag `v4.0.0-beta.1`, commit
  `265b113e9`), `@candid-core/schema`
  0.3.0-beta.1, and the module `@candid-core/cli` 0.2.0-beta.1 generates
  from `harness/icrc1.did`. Each tarball must have the `dist.integrity` the
  registry records, which `harness/ship.mjs` (`V4_NPM_RELEASES`) pins and
  `node setup.mjs --v4-from npm:4.0.0-beta.1` checks before anything is
  installed (it refuses another sha512, or a registry that no longer
  records the pin):

  | Tarball                            | `dist.integrity` (npm view, 2026-10-05)                                                           |
  | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
  | `@ic-reactor/core@4.0.0-beta.1`    | `sha512-qvxoX5SJa0ubJumLRctpYx9SqFynu3PXKO9E2fJpiDMKrb6y6rlxncR6XBALqjDdFi8UVYJxWXMhqG8Va/6alg==` |
  | `@ic-reactor/react@4.0.0-beta.1`   | `sha512-U0Bvz6qRmrnDCXCd27T28EJ3SNO5Z3eu2oENrHE5CMg6v36AzcjDWgwSzGTL+f8LDxGaFhvcuCGVAEYypNpCMg==` |
  | `@candid-core/schema@0.3.0-beta.1` | `sha512-fO7uDzR1Dv8vvLec0/2mRpIMQrNW0KeFwlRfkDBmEy2IQ9aUflaacZgNn4jnM9amKvldAHT/o2novcV2m07Usg==` |
  | `@candid-core/cli@0.2.0-beta.1`    | `sha512-kmm1+COrojOVLVcpVjgHZ1c0Y/RSQoq90u3Wim/ss384NMlm4fwC2cWA7eq225a8kv+uhz1YvlVrClNYFQCaLQ==` |

  The two ic-reactor rows are pinned and checked by setup; the schema row
  is what npm's lockfile in `.ship/v4` records for the installed copy (npm
  checks it when installing); the CLI runs through `npx` and is not
  shipped. The only documentation is the core tarball's `llms.txt`.
  Everything else is as in Addendum 3: the same install, the same
  refusals (`harness/check-docs.mjs` on the guide, `harness/ship.mjs` on the
  package code), the cut to `package.json` + `dist/`, and the scorer's copy
  with `@icp-sdk/core` linked to evals' own (`conditions/v4/README.md`).

- `thin-guide`: unchanged since the pilots (starter, dependencies, docs),
  re-run in the same batch as a same-day control: same model, effort, prompt
  and harness.

**The version under test** is 4.0.0-beta.1 as published, and it stays
4.0.0-beta.1 even if a 4.0.0-beta.2 (or the 4.0.0 tarball itself) is
prepared before or during the batch. The guide measured is the published
core tarball's `llms.txt`: 1,974 words (`wc -w`), sha256
`a07b846a637985bbf629abf65f524aea1f51887dc4099b814607fea299364342`,
byte-identical to `packages/core/llms.txt` at `265b113e9`, and 0 of 112
needles (`node harness/check-docs.mjs`). Packing that commit with `node
setup.mjs` (the tree mode) gives tarballs with other bytes (archive
metadata) and the same files, byte for byte, as the two published ones
(checked on 2026-10-05). The guide differs from the one Addendum 3
measured (1,970 words) in two places: the version line (`4.0.0-alpha.0` →
`4.0.0-beta.1`, same word count) and the 4-word change made after Addendum 3
("returns it (as anonymous while hydrating)", #820). The published packages
also hold two changes Addendum 3's commit (`1ff26e511`) did not: #819 (a
disposed client cancels every call, writes included) and #820 (hydration
keys: a client view pinned to the principal a render shows, and React keys
built for the caller React renders with). `.ship/v4/source.json` records
the source of the tree setup built (`npm`, the version, each tarball's
integrity, the guide's words and sha256); `drive.mjs` prints it in a dry run
and keeps it in `plan.json` as `v4Source`.

**Fixed from the earlier addenda, unchanged.** The two tasks (`node-tool`,
`react-wallet`), their hidden tests, the world, `task.json` (including
`notApplicable.minimal`: `refuses_amount_past_nat64`), `score.mjs`,
`harness/judge.mjs`, and the leak audit as of Addendum 3 (with its network
check). The prompts differ across conditions only in the `{{LIBRARY}}` line
(`harness/assemble.test.mjs`). The Definitions (safe-run rate; main and
intent-to-treat analyses), the handling of harness errors, contamination,
`--resume` and re-audits as Addendum 3's "Analyses" state them, and
Addendum 3's defaults: `--mode sandboxed`, `--timeout-min 30`,
`--max-turns 60`, `--retries 2` and the rate-limit settings.

**Harness changes since Addendum 3.** None in the hidden tests, the world,
`task.json`, `score.mjs` or `harness/judge.mjs`; between `1ff26e511` and
`265b113e9` nothing under `evals/` changed but this file, `README.md`, the
results of Addendum 3 and `conditions/v4/docs/llms.txt`. This addendum's
pull request adds:

- `node setup.mjs --v4-from npm:<version>`: the two v4 tarballs, from
  `npm pack <name>@<version>`, refused unless their sha512 equals the pin in
  `harness/ship.mjs` and the registry's `dist.integrity`; every later step
  is the packed tree's. `--v4-from tree`, the default, is Addendum 3's mode,
  unchanged. Setup writes `.ship/v4/source.json`.
- `harness/ship.test.mjs`: the npm source on local tarball fixtures
  (offline: a one-byte change, a missing tarball, a registry that disagrees,
  a version with no pin; and setup's download itself, `fetchV4Tarballs`,
  with `npm pack` and `npm view` faked), the recorded source against the
  tarballs in `.ship/v4/tarballs` and npm's lockfile, the guide byte for
  byte as the core tarball holds it, and one test that asks the registry
  whether it still records the pins (skipped, with the reason, when it
  cannot be reached).
- `harness/aggregate.mjs`: `pooled` in the main and intent-to-treat
  summaries: each comparison with the tasks pooled (safe runs and runs
  summed per condition over the tasks where both conditions have usable
  runs, within one model, effort level and prompt variant), with its
  Newcombe 95% interval and the counts; printed after the per-task
  differences. It decides nothing unless the pass rule below says so
  (alternative A).
- `drive.mjs`: the v4 source in a dry run and in `plan.json` (`v4Source`),
  each tested (`harness/drive.test.mjs`; `plan.json` by a stub batch that
  stops at its preflight).
- `conditions/v4/docs/llms.txt`: the published guide (1,974 words), which
  setup copies from the core tarball, replacing Addendum 3's 1,970-word copy.

**Design.**

- Prompt: `minimal` (`tasks/<task>/prompt.minimal.md`); run mode
  `sandboxed`.
- Cells: 2 tasks × 2 conditions = 4 cells, 20 runs per cell, 80 runs, in one
  batch, ordered round-robin in a shuffle seeded **20261005** (a new seed,
  the date this addendum was drafted; Addendum 3 used 1).
- Model `claude-sonnet-5-5` at effort `medium`, as in the pilots and
  Addendum 3, passed to the CLI as
  `--model claude-sonnet-5-5 --effort medium` and recorded in `plan.json`
  and every run record.
- Two agents at a time (`--jobs 2`), as in every batch so far: the
  credential is a subscription token, which is rate-limited per account
  (`README.md`, "Parallelism on a subscription"), and the machine (8 cores,
  8 GB) runs `tsc` and `vitest` inside each agent and then scores at the
  same parallelism. Addendum 3's runs took 0.6 to 0.8 min of agent time
  each (`results/2026-10-03-beta1-gate/pilot.json`), so 80 runs at 2 jobs
  are about half an hour of agents plus the scoring (the gate scores 56
  solutions in about 16 min at 3 jobs).
- Commands, from `evals/` on the harness commit named at freezing:

  ```bash
  node setup.mjs --v4-from npm:4.0.0-beta.1
  node --test harness/ship.test.mjs   # the registry test must run, not skip
  node gate.mjs --require v4          # must pass first: pass rule 2
  node drive.mjs --preflight --model claude-sonnet-5-5 --effort medium \
    --oauth-token-file <file>
  node drive.mjs --pilot --n 20 --prompt minimal \
    --condition v4 --condition thin-guide \
    --model claude-sonnet-5-5 --effort medium --seed 20261005 --jobs 2 \
    --margin 0.1 --out runs/ga-gate-<date> --oauth-token-file <file>
  ```

  `--n 20` sets the runs per cell; `--pilot` with it changes no run and only
  adds the per-cell minutes, turns and tokens report (`pilot.json`) that
  Addendum 3 reported, and `--margin 0.1` only sizes that report's runs per
  cell. `<date>` is the day of the batch.

- Rehearsed on 2026-10-05 with `--dry-run` (the batch command above without
  `--out` and the token file, on the tree `--v4-from npm:4.0.0-beta.1`
  built; nothing launched): 4 cells, 80 runs, 20 per cell, in a shuffle
  seeded 20261005 that begins `node-tool/thin-guide#1`,
  `react-wallet/thin-guide#1`, `node-tool/v4#1`, `react-wallet/v4#1`,
  `node-tool/thin-guide#2`, `node-tool/v4#2`, `react-wallet/v4#2`,
  `react-wallet/thin-guide#2`; each `v4` cell's `docs/` is `llms.txt` only,
  and each `thin-guide` cell's is the two candid-core READMEs and `llms.txt`,
  as in the pilots; "v4 built from: npm 4.0.0-beta.1" with the two pinned
  integrities and the guide's 1,974 words and sha256. (By chance, from the
  third run on, these eight are the same as seed 1's; the two orders of 80
  agree in 31 positions and then diverge.)

**Pass rule.** The owner kept alternative A of rule 1 and struck
alternative B on 2026-10-05, before freezing. B stays below, struck through,
as the record of what was chosen against. Rule 2 holds as written.

**Rule 1, alternative A (kept) — pooled over both tasks (80 runs).** The
safe-run rate of `v4` minus that of `thin-guide`, with both tasks pooled (each
condition's safe runs and runs summed over `node-tool` and `react-wallet`:
40 runs against 40), has a Newcombe 95% lower bound of at least **−0.10**,
in the main analysis and in the intent-to-treat analysis alike. This is
`pooled` in `summary.json` (`v4 - thin-guide`). It departs from the
Definitions ("Comparisons are within one task"): under this alternative
pooling the two tasks is the pre-registered comparison, still within one
model, effort level and prompt variant. Under A, rule 1 is not met if
`summary.json` has no pooled `v4 - thin-guide` row over both tasks in
either analysis (`aggregate.mjs` gives none when a cell of either condition
has no usable run in that analysis, for example a `thin-guide` cell whose
runs were all harness errors, or all contaminated in the main analysis).

~~**Rule 1, alternative B — per task (the literal reading of Q14), 80 runs.**
The same bound, at least **−0.10**, on `node-tool` and on `react-wallet`
separately (20 runs against 20), in both analyses. **At 20 runs per cell it
cannot pass**: with every run of both conditions safe, 20 of 20 against 20
of 20, the lower bound is −0.161. Kept only to state the literal reading
plainly. A per-task rule that can pass needs at least 35 runs per cell
(140 runs), and then, against a perfect `thin-guide`, passes only if every
`v4` run on that task is safe; tolerating one `v4` failure per task against a
perfect control needs 53 runs per cell (212 runs).~~ Struck by the owner on
2026-10-05; the per-task differences are reported, and decide nothing.

Under rule 1:

- "Safe" is as `score.mjs` and `harness/judge.mjs` compute it under the
  minimal prompt (no applicable safety requirement failed).
- The bound is read unrounded, computed from the counts with
  `harness/aggregate.mjs`'s `newcombe(x_v4, n_v4, x_tg, n_tg)` (the counts
  are in `summary.json`: `pooled[].counts`, or a cell's `runs` and
  `safeRate`); `summary.json` rounds to three decimals for display. The
  only outcome at 40 against 40 where the two readings differ is `v4` 38 of
  40 against `thin-guide` 37 of 40 (and its mirror, 3 of 40 against 2):
  unrounded −0.1001, shown as −0.1, which fails.
- Each `v4` cell must hold 20 scored runs, none contaminated: a `v4` cell
  with a contaminated run, or with fewer than 20 scored runs once
  `drive.mjs` has exhausted its retries and a `--resume` has completed the
  batch, does not meet rule 1 (as in Addendum 3). `thin-guide` cells enter
  the bound with the scored runs they have.
- `plan.json`'s `v4Source` must name `npm` 4.0.0-beta.1 with the two pinned
  integrities; a batch built from another source is not this addendum's.
- If the main and the intent-to-treat analyses disagree, rule 1 is not met
  (the Definitions call that ambiguous). Recommended: both must hold, as
  written.

**Rule 2. `node gate.mjs --require v4` passes** on the tree that `node
setup.mjs --v4-from npm:4.0.0-beta.1` built, before the batch: the `v4`
`reference` and `reference-module-scope` of both tasks pass every hidden
test with a clean `tsc`, the six ported faulty solutions and
`v4-anonymous-identity-sent` each fail exactly the tests in their
`meta.json`, and the pilots' references and faulty solutions behave as
before: 56 of 56, no cell skipped (`--require v4` fails the gate before
scoring when a `v4` cell is empty). If it fails, the batch does not start.
Run on 2026-10-05 on that tree (the published 4.0.0-beta.1, which holds
#819 and #820): **56 of 56**, no cell skipped, in 15 min 52 s at the
default `--jobs 3`; every `v4` reference and faulty solution failed exactly
the tests it failed on Addendum 3's commit, so neither change moved any of
them.

**What the margin means at this size**, from `harness/aggregate.mjs`'s own
`newcombe` (lower bound of the 95% interval for `v4 − thin-guide`; a pass
needs at least −0.10):

| `v4` failures | per task, 20 vs 20: `thin-guide` perfect | per task: one `thin-guide` failure | pooled, 40 vs 40: `thin-guide` perfect | pooled: one `thin-guide` failure |
| ------------- | ---------------------------------------- | ---------------------------------- | -------------------------------------- | -------------------------------- |
| 0             | −0.161 (fails)                           | −0.116 (fails)                     | **−0.088 (passes)**                    | **−0.065 (passes)**              |
| 1             | −0.236 (fails)                           | −0.191 (fails)                     | −0.129 (fails)                         | −0.106 (fails)                   |
| 2             | −0.301 (fails)                           | −0.255 (fails)                     | −0.165 (fails)                         | −0.142 (fails)                   |

"Pooled" counts failures over both tasks. So under A, `v4` passes only if
all 40 of its runs are safe, unless `thin-guide` fails too: one `v4`
failure passes only against at least two `thin-guide` failures (−0.085),
two only against at least four (−0.080). Per task, perfect results pass
from 35 runs per cell (−0.0989; 34 gives −0.1015), one `v4` failure against
a perfect control from 53 (−0.0994), two from 69, and one failure in each
condition from 43.

**Analyses**, as the Definitions and Addenda 1 to 3 define them:

- Main: contaminated runs excluded. Intent-to-treat: contaminated runs kept.
  Both from the same `summary.json` (`main`, `intentToTreat`), with
  contamination as the leak audit judged it at run time. A later re-audit
  (`--rescan`) is reported beside it and does not change the outcome
  without a further addendum.
- Harness errors are retried by the driver, then excluded and counted, never
  scored as 0. Completing a planned run that ended in a harness error
  (`drive.mjs --resume <dir>`) completes the batch; a scored run is never
  replaced.
- Reported for each cell: the safe-run rate with its Wilson 95% interval,
  per-requirement pass rates, mean requirements met, `tsc`-clean rate, the
  not-applicable `refuses_amount_past_nat64` results, minutes, turns and
  tokens. Reported for each task: `v4 − thin-guide` with its Newcombe 95%
  interval; and pooled over both tasks, with the counts. The one the kept
  alternative names decides rule 1; the other is reported only. For every
  unsafe run: which safety requirements and tests failed.
- `thin-guide` below the ceiling: if it is below 40 of 40 pooled (or below
  20 of 20 on a task), in either analysis, the report says so, and says
  that a `v4` pass then rests on a weaker control than the pilots' (each
  `thin-guide` failure lowers the bar `v4` has to clear), and that the
  pilots' baseline did not reproduce that day, as Addendum 3 said of a
  control below its ceiling. The number of scored `thin-guide` runs per
  task, and so any unequal attrition across the tasks, is reported with the
  result.

**If it fails.** If rule 1 or rule 2 is not met, the eval side of the GA
gate is not met on this batch. The batch, or any cell of it, is not run
again to look for a pass. If rule 2 fails, the batch does not start. For a
rule-1 failure the owner committed to this plan on 2026-10-05, before
freezing:

- Any rule-1 failure means GA waits. Every unsafe run is reported with the
  tests it failed, and each is traced to its cause.
- If the cause is in ic-reactor's API or its guide (including the
  `invalidates` wording that #831 has already corrected), it is fixed, if
  it is not fixed yet. A new batch is then pre-registered in a further
  dated addendum, on the version that carries the fix.
- If the cause is outside ic-reactor (the harness, the world or the
  scorer), it is reported, and the owner decides whether GA ships with the
  result stated.

Any change to the hidden tests, the world, the scoring, the prompts or this
rule after the batch starts needs a dated addendum and the owner's approval.

**Known limits.**

- Twenty runs per cell is near the floor for this margin. Under A, the
  kept alternative, the rule amounts to "every `v4` run safe, or
  `thin-guide` failing at least about twice as often" (one `v4` failure
  against two, two against four); under B, struck, it could not pass. Both
  arms were at the ceiling in every earlier batch on these tasks (Addendum
  2's re-scored second pilot, Result of Addendum 3), so the bound mostly
  reflects the number of runs. A pass shows that a
  difference worse than −0.10 is unlikely on these two tasks, not that the
  two stacks are equivalent; under A it does not show it on each task
  separately.
- The pooled estimate of alternative A is unstratified: each condition's
  safe runs and runs are summed over the two tasks, so tasks are weighted
  by their scored runs. If `thin-guide` loses runs on one task only (harness
  errors, or contamination in the main analysis) and the tasks' safe rates
  differ, its pooled rate shifts toward the other task's even when the
  per-task differences are the same. The per-task counts are reported with
  the result (Analyses), and unequal attrition across the tasks is named
  there.
- The version under test is the published 4.0.0-beta.1. Changes to the
  packages or the guide made after this addendum (in a 4.0.0-beta.2 or the
  4.0.0 tarball, if not byte-identical, at least its version line) are not
  measured; they are listed with the result and left to the owner, as
  Addendum 3's 4-word change was.
- One model at one effort level; the pilots' caveats hold (one author wrote
  the tasks, tests, guides and references; the separation from `thin` is
  exploratory).
- Addendum 3's known limits about the world (the fake replica installed as
  a global `fetch` stub, the scorer's shared `@icp-sdk/core`), the
  react-wallet `WalletAuth` adapter the agent writes, an explicit
  `AnonymousIdentity` being sent, a module-scope client handed to
  `ReactorProvider` (#805), and the ninth fraction digit still hold. #820
  changes hydrating renders, which no hidden test performs (none
  dehydrates, hydrates or renders on a server). #819 changes what a
  disposed client does with a write in flight: an agent's solution reaches
  it only if its client is disposed while the hidden tests still use it
  (every react-wallet test unmounts what it rendered, and
  `update_not_resent_on_refetch` unmounts and remounts), the module-scope
  trap above. The gate (rule 2) shows that the references and faulty
  solutions behave on the published packages exactly as on Addendum 3's
  commit; how agents' own solutions meet either change is part of what the
  batch measures.
- The registry is trusted only through the pin: setup refuses a tarball
  whose sha512 is not the pinned one. `@candid-core/schema` and the other
  dependencies are installed by npm at their exact versions and checked by
  npm against the registry's integrity, not against a pin of this
  addendum's (the schema's is recorded above).

**Freezing.** This addendum is frozen, by replacing its status line with the
date and recording the owner's approval below, when all of these hold: the
owner has kept one alternative of rule 1 and struck the other; `node
setup.mjs --v4-from npm:4.0.0-beta.1` has built the tree and `node --test
harness/ship.test.mjs` passes with the registry test run, not skipped;
`node gate.mjs --require v4` passes 56 of 56 on that tree; the dry run
matches the rehearsal above; and the harness commit the batch runs from
(this addendum's pull request merged into `v4`) is named here.

Approved by owner: yes, on 2026-10-05, in the owner's decisions on
Checkpoint 5 ("GA eval: keep alternative A of Addendum 4 (pooled over both
tasks, 80 runs) and strike B. Addendum 4 is approved."). The plan under "If
it fails" was added at the owner's request before freezing. The run budget is
the owner's earlier "up to 100 runs in total (the GA batch is 80)"; the other
20 are not used without asking. Frozen by the lead on 2026-10-05, with the
conditions under "Freezing" met:

- Rule 1: alternative A kept, B struck (Pass rule).
- The harness commit is `4ef91cb7be6804a2c323b1758cf117c0ac6be543` (#830
  merged into `v4`), which brought this addendum's harness. Nothing under
  `evals/` changed after it but this file. The batch runs from the merge of
  this freezing pull request into `v4`, whose `evals/` differs from
  `4ef91cb7b`'s in this file only; that is checked before the batch starts,
  and the merge commit is named with the result.
- `node setup.mjs --v4-from npm:4.0.0-beta.1` built the tree:
  `.ship/v4/source.json` names `npm` 4.0.0-beta.1, the two pinned
  integrities, and the guide's 1,974 words and sha256 above.
- `node --test harness/ship.test.mjs`: 27 of 27 pass, 0 skipped; the
  registry test ("pins what the npm registry records") ran against the
  registry, not skipped.
- `node gate.mjs --require v4` on that tree: 56 of 56 (20 references, 36
  faulty solutions), no cell skipped, in 15 min 24 s at the default
  `--jobs 3`.
- The dry run (the batch command under Design with `--dry-run`, without
  `--out` and the token file) matches the rehearsal: 4 cells, 80 runs, 20
  per cell, seed 20261005, the same first eight runs, the same `docs/` per
  cell, and "v4 built from: npm 4.0.0-beta.1" with the two pinned
  integrities and the guide's 1,974 words and sha256. Its output differs
  from the rehearsal's only in the worktree path and the line `--pilot`
  adds for its report.

Recorded with this approval, as the owner decided on 2026-10-05:

- The guide's growth after this addendum measured it is accepted: #831
  corrected the `invalidates` wording, and `packages/core/llms.txt` on `v4`
  is 1,986 words. The batch measures the published 1,974-word guide (Known
  limits).
- Addendum 3's approval line and its 56th gate cell
  (`node-tool/faulty/v4-anonymous-identity-sent`) are confirmed. Addendum 3
  is frozen, so the confirmation is recorded here.

## Result of Addendum 4 — 2026-10-05

Recorded after the batch; Addendum 4 itself is unchanged. The batch ran as
pre-registered from `9f78b706c`, the merge of #841, whose `evals/` differs
from the harness commit `4ef91cb7b` only in this file. Its shape:

- 80 runs, 4 cells of 20, round-robin in the shuffle seeded 20261005;
- `claude-sonnet-5-5` at effort `medium`, the minimal prompt, sandboxed, 2
  agents at a time, with a passing preflight;
- `plan.json`'s `v4Source` names `npm` 4.0.0-beta.1 with the two pinned
  integrities.

Every run exited normally, so no harness error was retried and 80 agent
runs were made in all. Results are in `results/2026-10-05-ga-gate/`, copied
from `runs/ga-gate-2026-10-05/`. `contaminated-run.json` holds the
contaminated run's audit record, the Bash call whose output the CLI saved,
and the whole file as the agent read it back, with its sha256.

| Task         | Condition    | Safe (main) | Safe (ITT) | Requirements met | `tsc` clean | Contaminated | Harness errors | Minutes (median) | Turns (median) |
| ------------ | ------------ | ----------- | ---------- | ---------------- | ----------- | ------------ | -------------- | ---------------- | -------------- |
| node-tool    | `v4`         | 20 of 20    | 20 of 20   | 1.00             | 1.00        | 0            | 0              | 0.65             | 7.5            |
| node-tool    | `thin-guide` | 20 of 20    | 20 of 20   | 1.00             | 1.00        | 0            | 0              | 0.61             | 6              |
| react-wallet | `v4`         | 19 of 19    | 20 of 20   | 1.00             | 1.00        | 1            | 0              | 0.81             | 8              |
| react-wallet | `thin-guide` | 20 of 20    | 20 of 20   | 1.00             | 1.00        | 0            | 0              | 0.82             | 6              |

Wilson 95% intervals: 20 of 20 is [0.839, 1] and 19 of 19 is [0.832, 1].
Every scored run is safe in both analyses, so no failing test or
requirement is left to report. `refuses_amount_past_nat64` stays not
applicable under the minimal prompt (observed: 0 of 40 on each task, all
conditions). `thin-guide` is at its ceiling in both analyses (20 of 20 on
each task) and scored 20 runs per task, so attrition is equal across the
tasks.

`v4 − thin-guide`, with Newcombe 95% intervals. Each lower bound is read
unrounded from `harness/aggregate.mjs`'s `newcombe`:

| Comparison                          | Main                                     | Intent-to-treat                          |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------- |
| **Pooled over both tasks (rule 1)** | 39/39 vs 40/40: 0, [**−0.0897**, 0.0876] | 40/40 vs 40/40: 0, [**−0.0876**, 0.0876] |
| node-tool (reported only)           | 20/20 vs 20/20: 0, [−0.161, 0.161]       | 20/20 vs 20/20: 0, [−0.161, 0.161]       |
| react-wallet (reported only)        | 19/19 vs 20/20: 0, [−0.168, 0.161]       | 20/20 vs 20/20: 0, [−0.161, 0.161]       |

**The contaminated run** is react-wallet/`v4`#14. The leak audit flagged
one Read of `<run>/home/.claude/projects/<project>/<session>/tool-results/b65qfoxqg.txt`
as a "file_path outside the run directory". The transcript shows what it
was:

1. The agent ran one Bash `cat` of its starter's own files: `docs/llms.txt`,
   `src/Wallet.tsx`, `src/main.tsx`, the head of the generated module,
   `test/support/world.ts`, `test/support/auth.ts` and the head of
   `TASK.md`.
2. The CLI answered "Output too large (29.6KB). Full output saved to:" that
   path.
3. The agent read the file back.

The path is inside the run's own home, which the driver creates for each
run, and the file holds only that run's own tool output, all of it from
`<run>/work`. Nothing outside the run was read. The audit counts only
`<run>/work` as the run directory and has no rule for the CLI's persisted
tool output. The CLI binary is the one Addendum 3's batch used (installed
2026-09-30); this persistence did not occur in that batch's 20 runs. Scored,
the run is safe, and it counts in the intent-to-treat analysis.

**Pass rule.**

- Rule 2 holds: `node gate.mjs --require v4` passed 56 of 56 on the tree,
  before the batch (Approval above).
- Rule 1's bound holds in both analyses: −0.0897 (main) and −0.0876
  (intent-to-treat), both at least −0.10.
- Rule 1 is **not met.** react-wallet/`v4` holds a contaminated run, and so
  only 19 scored, uncontaminated runs in the main analysis. "A `v4` cell
  with a contaminated run … does not meet rule 1."

**The eval side of the GA gate is not met on this batch, as written.**

**Under "If it fails".** No run is unsafe, so there is no failing test to
trace. The cause of the rule-1 failure is outside ic-reactor: the harness's
leak audit does not recognise the CLI's persisted tool output in the run's
own home. Under the plan committed before the batch, this is reported, and
the owner decides whether GA ships with this result stated. The batch is not
run again.

Reported beside the result, and changing nothing (as "Analyses" says of a
re-audit): with that one read counted inside the run, the run is
uncontaminated. The main analysis would then be 40 of 40 against 40 of 40
pooled, with a lower bound of −0.0876, and every `v4` cell would hold 20
scored, uncontaminated runs. Both a fix to the audit (accepting reads of the
run's own `home/.claude/projects/*/*/tool-results/` files) and any new batch
would need a further dated addendum and the owner's approval.

The caveats of "Known limits" apply. In particular, the batch measured the
published 4.0.0-beta.1 and its 1,974-word guide; `v4`'s guide is 1,986 words
since #831, a change the owner accepted.
