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

## Addendum 3 — the 4.0.0-beta.1 gate (draft)

**Status: Draft, to be frozen when the v4 references land.** Drafted on
2026-10-02, before any agent run of the `v4` condition. The text above,
including Addenda 1 and 2 and the Decision, is unchanged. Until it is frozen
this addendum may still be edited; once frozen it changes only through a
further dated addendum, and no `v4` agent run starts before it is frozen.

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

The commit under test, and the versions in
`.ship/v4/node_modules/@ic-reactor/*/package.json`, are written into this
addendum when it is frozen and into `results/README.md` with the results.

**Fixed from the earlier addenda, unchanged.** The two tasks (`node-tool`,
`react-wallet`), their hidden tests, the world, `task.json` (including
`notApplicable.minimal`: `refuses_amount_past_nat64`), `score.mjs`,
`harness/judge.mjs` and the leak audit as of Addendum 2. The prompts differ
across conditions only in the `{{LIBRARY}}` line (`harness/assemble.test.mjs`
checks it for every condition, `v4` included).

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
  node gate.mjs                 # must pass first: pass rule 2
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
   hidden test with a clean `tsc`, and the six v4-proto faulty solutions,
   ported (`conditions/v4/PORTING.md`: from `v4-proto-never-may-have-executed`,
   `v4-proto-refuses-nat64-max`, `v4-proto-retry-spread`,
   `v4-proto-keep-previous-data`, `v4-proto-every-reject-unknown` and
   `v4-proto-status-not-idle`), each fail exactly the tests in their
   `meta.json`: 55 of 55, no cell skipped. It is run before the batch; if
   it fails, the batch does not start.

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
  (issue #786).
- The react-wallet starter's `WalletAuth` is not an `AuthLike`; the agent
  writes the adapter the guide shows (Q14). How well the guide teaches it,
  and that an explicit `AnonymousIdentity` is sent while
  `identity: "anonymous"` is not (`conditions/v4/PORTING.md`), is part of
  what the batch measures.

**Freezing.** This addendum is frozen, by replacing its status line with the
date and recording the owner's approval below, when all of these hold:
the `v4` references and the six ported faulty solutions are in the tree and
`node gate.mjs` passes 55 of 55; `conditions/v4/docs/llms.txt` is DX3's
guide as packed and passes `node harness/check-docs.mjs`; the commit under
test is named above.

Approved by owner: not yet (draft).
