You are working in a small React 19 + TypeScript project (ESM, strict).
Implement a wallet component for an ICRC-1 token ledger on the Internet
Computer.

{{LIBRARY}}

## What to build

Implement `Wallet` in `src/Wallet.tsx`:

```tsx
export function Wallet(props: {
  auth: WalletAuth
  config: LedgerConfig
}): ReactElement
```

`WalletAuth` (`src/auth.ts`) is the sign-in state: `getIdentity()` returns the
current identity (the anonymous identity when signed out), `isAuthenticated()`
says whether someone is signed in, `login()` / `logout()` sign in and out, and
`subscribe(listener)` is called whenever any of that changes — including a
switch from one signed-in principal straight to another. `LedgerConfig`
(`src/config.ts`) is the replica `host`, the ledger `canisterId`, and the
`rootKey` of a local replica when there is one. Do not change `src/auth.ts`,
`src/config.ts` or `src/ii-auth.ts`. `Wallet` must work when rendered on its
own: set up whatever providers or clients it needs itself.

The component renders, with exactly these `data-testid`s:

- `signin` — a button, rendered only while signed out; it calls
  `auth.login()`.
- `signout` — a button, rendered only while signed in; it calls
  `auth.logout()`.
- `balance` — the balance of the signed-in principal's default account (no
  subaccount), read with `icrc1_balance_of`, as whole tokens with exactly 8
  fraction digits and no grouping: `12.34500000`, `0.00000001`. The element's
  entire text content is that number (put any label or unit outside it); while
  there is no balance to show, the element may be absent or hold text with no
  digits in it. The token has 8 decimals.
- `transfer-to` — a text `<input>` for the recipient's principal text.
- `transfer-amount` — a text `<input>` for the amount in whole tokens (`1.5`).
- `transfer-submit` — a button that sends the transfer with `icrc1_transfer`
  from the signed-in principal's default account to the recipient's default
  account.
- `transfer-status` — an element, always rendered, whose `data-state`
  attribute is `idle` until the first transfer is submitted and then one of
  `pending` (in progress), `success` (the ledger accepted it), `error` (it
  failed and certainly had no effect) or `unknown` (it failed, but may
  nevertheless have taken effect); its text is up to you.

{{RUN}}
