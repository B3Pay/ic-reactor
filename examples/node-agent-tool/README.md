# Node agent tool on ic-reactor 4

A command-line tool for ICRC-1 ledgers that a person or an AI agent runs:
`whoami`, `info`, `balance`, `transfer`, `watch`, and a narrated `demo`. It is
`@ic-reactor/core` outside React: one `createClient({ network, identity })` per
run, direct calls, certified reads, the `QueryClient` in a long-running
process, every failure read through `isReactorError` and its `kind`, and
`mayHaveExecuted` after a write. Each scenario is one file whose header says
which rule it shows. Node 22.18 or newer runs the TypeScript as it is; there is
no build step and no CLI framework (`node:util`'s `parseArgs`).

## Run it

From the repository root, after `pnpm install` and `pnpm build`:

```sh
pnpm --filter node-agent-tool demo    # every way a transfer ends, in memory: no network, no funds
cd examples/node-agent-tool
node src/cli.ts info --ledger ckbtc   # mainnet, anonymous
node src/cli.ts balance rkp4c-7iaaa-aaaaa-aaaca-cai --certified --json
node src/cli.ts transfer rkp4c-7iaaa-aaaaa-aaaca-cai 1   # refused: exit 4, nothing sent
node src/cli.ts whoami --pem me.pem   # icp identity export <name> > me.pem
node src/cli.ts watch rkp4c-7iaaa-aaaaa-aaaca-cai --interval 2000   # Ctrl-C stops
node src/cli.ts --help
pnpm test        # every scenario, on createTestClient(): no network
pnpm typecheck
pnpm gen:check   # fails if src/canisters/ is stale against icrc1.did
```

`pnpm --silent cli <command>` is `node src/cli.ts` without Node's
type-stripping warning (and, with `--silent`, without pnpm's banner on
stdout). `src/canisters/icrc1.ts` is generated from `icrc1.did` by `pnpm gen`
(`candid-core-cli gen`), committed, and never edited.

## Scenarios

| Scenario                                                                                                                                                                                                                               | File                                              | See it                                                                            | Tests                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. **Identity**: `--pem` (Ed25519 or secp256k1, dfx's form too), else the hex seed in `NODE_AGENT_TOOL_SEED`, else `identity: "anonymous"`, whose writes the client refuses                                                            | `src/identity.ts`, `src/commands/whoami.ts`       | `whoami`, `whoami --pem me.pem`, an anonymous `transfer`                          | `src/identity.test.ts`                                                                |
| 2. **Networks**: `--network ic\|local\|<url>`; a root key is fetched only from this machine, a remote URL needs `--root-key <hex>`                                                                                                     | `src/network.ts`                                  | `info --network https://example.org` (refused), `--network http://127.0.0.1:8001` | `src/network.test.ts`                                                                 |
| 3. **Many ledgers, one interface**: `--ledger icp\|ckbtc\|cketh\|<id>`, each `client.canister<Actor>(actor, { id })`                                                                                                                   | `src/ledgers.ts`                                  | `info --ledger cketh`                                                             | `src/ledgers.test.ts`                                                                 |
| 4. **Direct calls**: `info` (five reads in parallel) and `balance`; `--certified` reads through `{ id, certified: true }` and says which reads were certified                                                                          | `src/commands/info.ts`, `src/commands/balance.ts` | `info --certified`, `balance <p> --certified`                                     | `src/commands/reads.test.ts`                                                          |
| 5. **Writes**: `parseUnits` at the ledger's decimals, its fee, `created_at_time`; a `kind` switch with an exit code per kind; after `mayHaveExecuted`, a re-read and the exact same-argument re-send (`--resend-unknown` does it once) | `src/commands/transfer.ts`, `src/failure.ts`      | `pnpm demo`, steps 2 to 10                                                        | `src/commands/transfer.test.ts`, `src/commands/resend.test.ts`, `src/failure.test.ts` |
| 6. **JSON for agents**: `--json` on every command, one stable shape                                                                                                                                                                    | `src/output.ts`                                   | any command with `--json`                                                         | `src/output.test.ts`                                                                  |
| 7. **The cache outside React**: `watch` reads through `client.queryClient.fetchQuery(client.queryOptions(...))`, invalidates the balance alone each interval, prints only changes, disposes the client on Ctrl-C                       | `src/commands/watch.ts`                           | `watch <p>`                                                                       | `src/commands/watch.test.ts`                                                          |
| 8. **Every failure, narrated**: `demo` runs the commands above on `createTestClient()` with a mocked ledger, arms one failure per step, and shows what the replica saw                                                                 | `src/commands/demo.ts`, `src/mock-ledger.ts`      | `pnpm demo`, `pnpm demo --json`                                                   | `src/commands/demo.test.ts`, `src/cli.test.ts`                                        |

`pnpm demo` walks through: a transfer; the ledger's `InsufficientFunds`; a
lost reply (`outcome_unknown`), its re-read and printed re-send, which the
ledger answers `Duplicate`; the same with `--resend-unknown`; an HTTP 429 the
client re-sends by itself; reject code 4; a signed-out write; input refused
before sending (`principal()`, `parseUnits`, and a `nat64` the client will not
encode). It exits 1 if any step ends otherwise.

## Exit codes

| Code | `kind`            | `mayHaveExecuted` | What to do                                                                      |
| ---- | ----------------- | ----------------- | ------------------------------------------------------------------------------- |
| 0    |                   |                   | Done. A transfer the ledger answers `Duplicate` had gone through: also 0.       |
| 1    | `unexpected`      | after a send: yes | A bug in the tool.                                                              |
| 2    | `usage`           | no                | Bad flags or input, refused before the client was asked.                        |
| 3    | `invalid_args`    | no                | The client could not encode the arguments; nothing sent.                        |
| 4    | `unauthenticated` | no                | A write without a key: pass `--pem` or set `NODE_AGENT_TOOL_SEED`.              |
| 5    | `not_delivered`   | no                | Refused before it got in (the client already re-sent where safe). Run it again. |
| 6    | `outcome_unknown` | yes               | Run the printed re-send command, never a new transfer.                          |
| 7    | `rejected`        | write, code 4/5   | Read `rejectCode`; when it may have executed, as for 6.                         |
| 8    | `invalid_reply`   | a write: yes      | Not the ledger it should be, or as for 6 after a write.                         |
| 9    | `canister_err`    | no                | The ledger's `Err` (`err.tag`): `InsufficientFunds`, `BadFee`, `TooOld`, ...    |
| 10   | `cancelled`       | rarely            | The client was disposed or the call aborted.                                    |

## JSON output

With `--json`, stdout carries one JSON object per line (one per command; one
per event for `watch` and `demo`), and nothing else. Every object has `ok` and
`command`. A transfer that went through has `outcome` (`"sent"`, or
`"duplicate"` when the ledger had it already), `block`, `resent`, and after a
re-send `firstAttempt` (the first failure). A failure is
`{ "ok": false, "command", "kind", "mayHaveExecuted", "message" }`, plus
`code`, `rejectCode`, `httpStatus` when the `ReactorError` has them, and for a
transfer `err` (the ledger's `Err`), `balance.before`/`after`, `resend` (the
argv that re-sends the same argument) and `dedupUntil`. A bigint is a decimal
string, bytes are hex, and an amount is `{ "units": "150000000", "tokens": "1.5" }`.

```text
{"ok":true,"command":"balance","network":"ic","ledger":{"id":"ryjl3-tyaaa-aaaaa-aaaba-cai","name":"icp"},"account":{"owner":"rkp4c-7iaaa-aaaaa-aaaca-cai","subaccount":null},"balance":{"units":"3023466972","tokens":"30.23466972"},"symbol":"ICP","decimals":8,"reads":{"icrc1_balance_of":"certified","icrc1_decimals":"query","icrc1_symbol":"query"}}
{"ok":false,"command":"balance","kind":"usage","mayHaveExecuted":false,"message":"owner \"x\" is not a principal (principal(): \"x\" is not canonical principal text)"}
```

## An unknown outcome, and the re-send

ICRC-1 ledgers deduplicate: the same sender sending the same argument
(`created_at_time` included) within about 24 hours gets
`Duplicate { duplicate_of }` and moves nothing. So after `outcome_unknown` the
tool never builds a new transfer: it reads the balance back and prints the
command that sends the very same one (`--fee` and `--created-at-time` pinned,
the same `--pem`). Run it: `Duplicate` means the first went through, a block
index means it had not and now has. `--resend-unknown` does this once by
itself. After the window the ledger answers `TooOld`, and only the balance or
the ledger's history can tell.

## A real local ledger

`icp.yaml` starts an icp-cli network with the NNS (the ICP ledger at its
mainnet id) on port 8001; icp-cli is a devDependency, pinned at 1.2.0.

```sh
pnpm exec icp network start -d
pnpm exec icp token transfer 100 <your principal> --identity anonymous   # icp-cli seeds the anonymous account
node src/cli.ts transfer <principal> 1.5 --pem me.pem --network http://127.0.0.1:8001
node src/cli.ts watch <principal> --network http://127.0.0.1:8001 --interval 1000
pnpm exec icp network stop
```

Run the same `transfer` twice with one `--created-at-time` and the second
answers `Duplicate`; `--fee 0.001` gives `BadFee`, an old `--created-at-time`
`TooOld`. The client fetches this replica's root key because `127.0.0.1` is
this machine; for any other host the tool asks for `--root-key`.
