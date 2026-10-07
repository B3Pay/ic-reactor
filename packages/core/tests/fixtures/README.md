# Generated fixtures

The `.ts` modules here are what `candid-core-cli gen` writes for the `.did`
files next to them, kept byte for byte (Prettier skips them; see
`.prettierignore`). The tests type against their `Actor` types and call
through their `actor` schemas exactly as an app does.

| `.did`           | What it is for                                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icrc1.did`      | The ICRC-1 ledger (the same file as the `icrc-ledger` example): principals, opts, blobs, `nat8` and `nat`, and `Ok`/`Err` results. `icrc1.envelope.json` is its Contract envelope, for the test that `schemaFromContract` gives the same keys. |
| `shapes.did`     | One method per shape the call path handles: 0, 1 and n results, a void update, a oneway, a composite query, lower-case and bare-arm results, a variant that is not a result, a two-argument method, `opt opt`.                                 |
| `archive.did`    | A ledger whose reply carries func references (archive callbacks), for `client.func`.                                                                                                                                                           |
| `management.did` | The IC management canister: `docs/references/_attachments/ic.did` of dfinity/portal at `fe646b2990d25d0f00714d50d9df283dac5d2e91` (2026-05-12), unchanged.                                                                                     |
| `skippable.did`  | One query per shape of variables `skipToken` might be assignable to (an empty record, a record of opts alone, an opt, `reserved`, `null`, no arguments), for the type tests of which reads keep `SkipToken` in their `queryFn`.                |

## Regenerating

With `@candid-core/cli@0.2.0` (the generator that pairs with
`@candid-core/schema@0.3.0`), from this directory:

```sh
npx -y @candid-core/cli@0.2.0 gen icrc1.did shapes.did archive.did management.did skippable.did -o .
```

Add `--check` to the same command to verify that nothing drifted. Each
`.did` also gets its `.envelope.json`; only `icrc1.envelope.json` is read by a
test, and the others are kept so that `--check` passes as it stands.
