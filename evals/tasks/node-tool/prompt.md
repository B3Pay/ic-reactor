You are working in a small TypeScript project (ESM, strict). Implement a Node
module for an ICRC-1 token ledger on the Internet Computer.

{{LIBRARY}}

## What to build

Implement `createLedgerTool(config)` in `src/index.ts`. Its types are in
`src/contract.ts`; do not change that file. The returned object has:

- `getBalance(owner: string): Promise<bigint>` — the balance, in base units,
  of the default account (no subaccount) of the principal whose text is
  `owner`, read with `icrc1_balance_of`.
- `transfer({ to, amount }): Promise<TransferResult>` — send `amount` from the
  default account of the configured identity to the default account of the
  principal whose text is `to`, with `icrc1_transfer`.

`config.host` is the replica URL and `config.canisterId` the ledger. When
`config.identity` is absent or anonymous, the tool is read-only.

## Requirements

1. `amount` is a decimal string in whole tokens; the token has 8 decimals
   (`"1.5"` is 150000000 base units). Refuse, without contacting the ledger,
   any amount that is not a plain non-negative decimal, has more than 8
   fraction digits, or whose base units do not fit in a `nat64`
   (18446744073709551615 is the largest, and is accepted). Refuse, without
   contacting the ledger, a recipient that is not valid principal text.
2. Never send a transfer as the anonymous principal. With no identity, or an
   anonymous one, `transfer` returns a failure without contacting the ledger.
3. The root key: when `config.rootKey` is given, the agent must use it and
   must not fetch a root key. Fetch a root key from the replica only when
   `config.rootKey` is absent and the host is local (`localhost`,
   `127.0.0.1` or `[::1]`); never fetch one from any other host.
4. Never send a transfer again automatically, unless the failure proves the
   ledger never processed it: the Internet Computer rejected the call with
   reject code 1, 2 or 3 (system errors, an invalid destination), or the
   replica or boundary node refused the HTTP request with a 4xx status other
   than 408. After any other failure, the transfer is not sent again.
5. `transfer` never throws for a ledger or network failure: it returns
   `{ ok: true, blockIndex }` when the ledger accepted it, and otherwise
   `{ ok: false, mayHaveExecuted, reason }`. `mayHaveExecuted` is `false`
   only when the transfer certainly had no effect: it was refused before
   anything was sent, the ledger replied with `Err`, or the failure proves
   the ledger never processed it (reject code 1, 2 or 3; an HTTP 4xx other
   than 408). In every other failure it is `true` — a network failure after
   the request was sent, a timeout, an HTTP 5xx or 408, and a reject that
   comes from the ledger's own code (reject codes 4 and 5, an explicit reject
   or a trap), because a canister can commit state before it fails.
6. `getBalance` always reads the ledger's current balance; a balance read
   after a transfer (successful or not) must reflect that transfer if it
   happened.
7. Balances and amounts are exact: never convert them to `number`.

{{RUN}}
