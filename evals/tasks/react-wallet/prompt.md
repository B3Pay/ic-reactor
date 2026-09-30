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
- `balance` — while signed in and loaded, an element whose entire text
  content is the balance of the signed-in principal's default account (no
  subaccount), read with `icrc1_balance_of`, as whole tokens with exactly 8
  fraction digits and no grouping: `12.34500000`, `0.00000001`,
  `123456789012.34567891`. Nothing else goes inside that element (put any
  label or unit outside it). The token has 8 decimals. While the balance is
  loading, or while signed out, the element may be absent or hold a
  placeholder with no digits in it — never a number that is not the current
  signed-in principal's balance.
- `transfer-to` — a text `<input>` for the recipient's principal text.
- `transfer-amount` — a text `<input>` for the amount in whole tokens (`1.5`).
- `transfer-submit` — a button that sends the transfer with `icrc1_transfer`
  from the signed-in principal's default account to the recipient's default
  account.
- `transfer-status` — an element, always rendered, whose `data-state`
  attribute is `idle` until the first transfer is submitted and then one of
  `pending`, `success`, `error` or `unknown`; its text is up to you.

## Requirements

1. Refuse, without contacting the ledger, an amount that is not a plain
   non-negative decimal, has more than 8 fraction digits, or whose base units
   do not fit in a `nat64` (18446744073709551615 is the largest, and is
   accepted). Refuse, without contacting the ledger, a recipient that is not
   valid principal text.
2. Never send a transfer unless someone is signed in, and never as the
   anonymous principal.
3. The root key: when `config.rootKey` is given, the agent must use it and
   must not fetch a root key. Fetch a root key from the replica only when
   `config.rootKey` is absent and the host is local (`localhost`,
   `127.0.0.1` or `[::1]`); never fetch one from any other host.
4. Send each transfer once per click, and never send it again automatically
   — not on a failure, not when the window regains focus or the network comes
   back, not when the component re-mounts — unless the failure proves the
   ledger never processed it: the Internet Computer rejected the call with
   reject code 1, 2 or 3 (system errors, an invalid destination), or the
   replica or boundary node refused the HTTP request with a 4xx status other
   than 408.
5. After a successful transfer, `data-state` is `success` and the balance
   shown is refreshed. After a transfer that certainly had no effect — the
   ledger replied with `Err`, or the failure proves the ledger never
   processed it (reject code 1, 2 or 3; an HTTP 4xx other than 408) —
   `data-state` is `error`. In every other failure the outcome is unknown: a
   network failure after the request was sent, a timeout, an HTTP 5xx or 408,
   and a reject that comes from the ledger's own code (reject codes 4 and 5,
   an explicit reject or a trap, since a canister can commit state before it
   fails). Then `data-state` is `unknown`, never `error`, and the balance is
   read again from the ledger so the user sees what really happened.
6. After signing in, signing out, or switching principal, never show a
   balance that belongs to a different principal than the one signed in now —
   not even briefly while the new balance loads, and not when a read that
   was in flight for the previous principal completes afterwards.
7. Balances and amounts are exact: never convert them to `number`.

{{RUN}}
