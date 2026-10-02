# ICRC-1 ledger on ic-reactor 4

An ICRC-1 ledger app on `@ic-reactor/core` and `@ic-reactor/react`, with two
tabs:

- **Mainnet** reads the real ICP ledger (or ckBTC, or any ledger id you paste)
  with `createClient({ network: "ic", identity: "anonymous" })`: name, symbol,
  decimals, fee, total supply, minting account, metadata, and the balance of a
  principal you type. The balance is `skipToken` until `isPrincipal()` accepts
  the owner. "Not a ledger" shows the error panel, which names the failure's
  `kind` and says whether the call may have executed. "Certified reads" makes
  the ledger `{ id, certified: true }`. For the ICP ledger, **Blocks** pages
  through `query_blocks`: the ledger holds only its newest blocks, and for
  older ranges its reply carries a callback (an archive canister and a
  method) that `client.func(QueryArchiveFn, range.callback)` calls
  (`src/blocks.ts`). "Genesis" reads the 2021 mints from the first archive.
  `client.func()` has no certified path, so archived blocks come from a plain
  query even with "Certified reads" on, and are cached without the
  `'certified'` key segment.
- **Sandbox** runs `createTestClient()` from `@ic-reactor/core/testing` in the
  page: a real client (it signs, sends and checks certificates) over the
  in-memory replica, with a mocked ICRC-1 ledger (`src/sandbox.ts`) that keeps
  a balance per account, burns the fee and answers with the standard's `Err`
  arms. Sign in as seed 1, switch to seed 2, sign out, and send transfers
  (`useMutation(client.mutationOptions(ledger, "icrc1_transfer"))`, amounts
  read with `parseUnits`). Arm a fault for the next transfer and watch the
  request log:

| Fault                  | What the client does                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| reject code 4          | `rejected`, may have executed: it re-reads the balance, which shows nothing moved                       |
| lost reply             | `outcome_unknown`, may have executed: the re-read shows the debit; sending it again answers `Duplicate` |
| status 429 once        | re-sends once by itself (the request log shows two calls), and the transfer goes through                |
| reject code 2 once     | the same single re-send                                                                                 |
| status 429 three times | gives up after two re-sends: `not_delivered`, certainly not executed                                    |
| (signed out)           | `unauthenticated`, refused before anything is sent                                                      |

The Sandbox also has a mocked ckBTC minter. `get_btc_address` is an update
method, which `client.queryOptions` refuses unless told it is idempotent:
`client.queryOptions(minter, "get_btc_address", arg, { update: "idempotent" })`
fetches each caller's deposit address once and keeps it (hide and show it, or
send a transfer: no new call reaches the minter). The smoke script asks
the real minter on mainnet the same way, signing with a throwaway key.

## Run it

From the repository root, after `pnpm install` and `pnpm build`:

```sh
pnpm --filter icrc-ledger dev        # http://localhost:5173
pnpm --filter icrc-ledger test       # the sandbox ledger, the form, the Sandbox page
pnpm --filter icrc-ledger smoke      # ledger, blocks and ckBTC minter on mainnet, Node 22.18+
pnpm --filter icrc-ledger gen:check  # fails if src/canisters/ is stale
```

`src/canisters/` is generated from the `.did` files (`icrc1.did`; the ICP
ledger's block reads, `icp_ledger.did`; the minter's `ckbtc_minter.did`) by
`@ic-reactor/vite-plugin` on every `vite dev` and `vite build` (`pnpm gen` runs
`candid-core-cli gen` by hand). It is committed, and never edited.

## Before and after

The same explorer written on `@candid-core/schema` alone needed a 176-line
`src/ledger.ts` (look the method up, encode, `agent.query`, decode, a query key
from the encoded bytes, and its own error union) and a 53-line `useQuery`
wrapper, and could only read. Here `src/ledger.ts` is 15 lines, 7 of them code:
a client and `client.canister<Actor>(actor, { id })`. Reads are
`useQuery(client.queryOptions(ledger, method, arg))` and the transfer is
`useMutation(client.mutationOptions(ledger, "icrc1_transfer"))`, with caller
keys, retries, invalidation and `ReactorError` coming from the client.

## Files

- `src/ledger.ts`: the mainnet client and the ledger on it.
- `src/MainnetTab.tsx`, `src/ErrorPanel.tsx`: the Mainnet tab.
- `src/blocks.ts`: `query_blocks` and its archive callbacks
  (`icp_ledger.did`), tested over a mocked ledger and archive by
  `src/blocks.test.ts`.
- `src/minter.ts`: the ckBTC minter's id and canister.
- `src/sandbox.ts`: the test client, the mocked ledger and minter, tested in
  Node by `src/sandbox.test.ts`; `src/SandboxTab.tsx` is its page, rendered in
  jsdom by `src/SandboxTab.test.tsx`.
- `src/transfer-form.ts`: typed text to an `icrc1_transfer` argument, or a refusal.
