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
  principal whose text is `to`, with `icrc1_transfer`. `amount` is a decimal
  string in whole tokens; the token has 8 decimals (`"1.5"` is 150000000 base
  units).

`config.host` is the replica URL, `config.canisterId` the ledger,
`config.rootKey` the root key of a local replica when there is one, and
`config.identity` the identity that signs transfers.

`transfer` does not throw: it always resolves to a `TransferResult`. That is
`{ ok: true, blockIndex }` when the ledger accepted the transfer, and
otherwise `{ ok: false, mayHaveExecuted, reason }`, where `mayHaveExecuted`
says whether the transfer could nevertheless have taken effect on the ledger
and `reason` is a human-readable explanation.

{{RUN}}
