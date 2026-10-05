# Pilot results

Aggregated results of the two pilots, copied from `runs/` (which is ignored:
it holds agent transcripts and solutions). Each directory has the run plan,
the summary as scored at run time, and the re-scanned / re-scored summaries
described in `../PREREGISTRATION.md`.

- `2026-09-30T14-22-05-924Z`: explicit prompt.
- `2026-09-30T15-48-23-343Z`: minimal prompt.
- `2026-10-03-beta1-gate`: the 4.0.0-beta.1 gate of Addendum 3 (minimal
  prompt; `v4` and a same-day `thin-guide` control; 5 runs per cell). Commit
  under test `1ff26e511`, `.ship/v4` holding `@ic-reactor/core` and
  `@ic-reactor/react` 4.0.0-alpha.0 and `@candid-core/schema` 0.3.0-beta.1;
  `claude-sonnet-5-5` at effort `medium`, seed 1, 2 agents at a time. Copied
  from `runs/beta1-gate-2026-10-03/` (plan, summary as scored at run time,
  pilot statistics).
- `2026-10-05-ga-gate`: the 4.0.0 GA gate of Addendum 4 (minimal prompt;
  `v4` from the published 4.0.0-beta.1 tarballs and a same-day `thin-guide`
  control; 20 runs per cell). Run from `9f78b706c` (harness `4ef91cb7b`);
  `claude-sonnet-5-5` at effort `medium`, seed 20261005, 2 agents at a
  time. Copied from `runs/ga-gate-2026-10-05/` (plan, summary as scored at
  run time, pilot statistics), plus `contaminated-run.json`: the audit
  record and transcript excerpts of the one contaminated run.
