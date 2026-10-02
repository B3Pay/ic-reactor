# Porting the v4-proto solutions to `v4`

The work list for DX5's second phase (issue #786): the two tasks' v4-proto
reference solutions and the six v4-proto faulty solutions, rewritten against
ic-reactor 4. Written on 2026-10-02 against the **planned** API: SCOPE item 1,
DECISIONS Q1 to Q14, and the slices that build it (IR1 #779, IR6 #780, IR2t
#782, IR5 #777, IR3 #775). Where the shipped API differs, the shipped API wins
and this file changes in the same PR as the port.

## Rules for the port

- **Same product, new library.** Each port keeps the reference's behaviour
  line for line (the same refusals, the same `data-state` rule, the same
  module-scope or per-tree lifetime) and changes only what ic-reactor 4 now
  does for it. A port that needs new behaviour is a finding, not a port.
- **Where it goes.** References: `tasks/<task>/solutions/v4/reference/` and
  `tasks/<task>/solutions/v4/reference-module-scope/`. Faulty solutions:
  `tasks/<task>/faulty/v4-<name>/`, where `<name>` is the v4-proto name
  without its `v4-proto-` prefix (so `v4-proto-retry-spread` becomes
  `v4-retry-spread`), each the v4 `reference` with the one change named
  below, and `meta.json` with `"condition": "v4"`. The v4-proto originals
  stay: they gate the v4-proto condition.
- **Expected failures.** Start from the v4-proto `meta.json` `expectFail`. If
  `node gate.mjs` shows a different set, change it only with the reason in
  `meta.json` `bug` and in the README's faulty-solution table: the hidden
  tests, the world and the scoring do not change (issue #786, "Not in
  scope").
- **The gate.** `node gate.mjs --require v4` must then report 45 + 4 + 6 =
  55 of 55. `--require v4` fails the gate before scoring while either task's
  `v4` cell has no reference, and a ported faulty solution in a task whose
  `v4` references are missing fails it even without the flag, so a port
  left half done cannot pass.
- **Imports.** `@ic-reactor/core` (`createClient`, `isReactorError`,
  `parseUnits`, `formatUnits`, types `AuthLike`, `Client`, `ReactorError`);
  `@ic-reactor/react` (`ReactorProvider`, `useClient`, `useAuth`);
  `@candid-core/schema` (`isPrincipal`, `principal`, `Principal`: the only
  import path for Candid values, D35); `@tanstack/react-query` (`useQuery`,
  `useMutation`, `skipToken`); `./generated/icrc1` (`actor`, `type Actor`).
  There is no `icrc1.service.ts`: the v4 condition's starter holds only the
  CLI's `icrc1.ts`, and no mode map exists in v4 (CC2 was dropped).

## API map

| v4-proto (prototype)                                                                 | v4 (planned)                                                                                                                                                                                    | Decided by                    |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `import { LedgerService } from "./generated/icrc1.service"`                          | `import { actor, type Actor } from "./generated/icrc1"`                                                                                                                                         | SCOPE 1e                      |
| `createClient({ network: { host, rootKey }, identity })`, identity optional          | `createClient({ network: { host, rootKey }, identity })` where `identity` is an `Identity` or `"anonymous"`, and required (or `auth`)                                                           | SCOPE 1a, 1b; D29; #779       |
| `createClient({ network, auth })` taking the starter's `WalletAuth` as is            | `createClient({ network, auth: () => walletAuthLike(auth) })`: a factory of an `AuthLike` (adapter below)                                                                                       | Q14; #779                     |
| `client.canister(LedgerService, { id })`                                             | `client.canister<Actor>(actor, { id })`, memoized per (schema, target), so it can be called in render                                                                                           | Q1                            |
| `ledger.icrc1_balance_of([account])`                                                 | `ledger.icrc1_balance_of(account)`                                                                                                                                                              | Q3: one argument is the value |
| `ledger.icrc1_transfer([arg])` → block index                                         | `ledger.icrc1_transfer(arg)` → block index (`Ok` unwrapped); `Err` rejects kind `canister_err` with `.err` typed `TransferError`                                                                | Q3, Q7                        |
| `ledger.icrc1_balance_of.queryOptions([account] \| skipToken)`                       | `client.queryOptions(ledger, "icrc1_balance_of", account \| skipToken)`                                                                                                                         | Q1, Q3                        |
| `ledger.icrc1_transfer.mutationOptions({ invalidates: [ledger.icrc1_balance_of] })`  | `client.mutationOptions(ledger, "icrc1_transfer")`: by default it invalidates the ledger's reads for every caller (Q10); the explicit form is `{ invalidates: [[ledger, "icrc1_balance_of"]] }` | Q1, Q10; #782                 |
| `transfer.mutate([arg])`                                                             | `transfer.mutate(arg)`                                                                                                                                                                          | Q3                            |
| `isReactorError(e)`, `e.kind`, `e.mayHaveExecuted`, `e.message`, `e.err.tag`         | the same names from `@ic-reactor/core`                                                                                                                                                          | Q6; IR3 #775                  |
| `isPrincipalText(text)`, `PrincipalText`                                             | `isPrincipal(text)`, `Principal` from `@candid-core/schema` (`principal(text)` throws `TypeError` instead)                                                                                      | D35                           |
| `useSyncExternalStore(client.subscribe, client.caller)` + `client.isAuthenticated()` | `const { status, principal } = useAuth()`; signed in exactly when `status === "signed-in"`                                                                                                      | Q11; #780                     |
| `useState(() => new QueryClient())` + `QueryClientProvider`                          | `ReactorProvider` with a client factory; it renders `QueryClientProvider` with `client.queryClient`                                                                                             | SCOPE 1d; D31; #780           |
| hand-written `parseAmount` (regex, `100_000_000n`)                                   | `parseUnits(text, 8)` in a `try`; it throws `TypeError` (malformed) or `RangeError` (negative, more than 8 significant decimals)                                                                | IR5 #777                      |
| hand-written `formatE8s`                                                             | `formatUnits(value, 8, { minFractionDigits: 8 })` (`50.00000000`, no grouping)                                                                                                                  | IR5 #777                      |

Two `parseUnits` differences from the v4-proto regex, both outside what the
hidden tests send: it trims surrounding spaces and accepts `"1."`, `".5"` and
trailing zeros past the 8th digit (`"1.123456780"` is 112345678 base units),
where the regex refused them. The port keeps `parseUnits` as is.

**The nat64 cap stays hand-written.** The ledger's `amount` is Candid `nat`,
which has no cap, so neither `parseUnits` nor the codec refuses 2^64 base
units. The explicit prompt (under which `gate.mjs` scores) states the cap, so
both references keep `NAT64_MAX = 18_446_744_073_709_551_615n` and refuse
`units > NAT64_MAX` before calling the ledger.

**Anonymous identities: a trap the port must not fall into.** In v4,
`identity: "anonymous"` makes every update reject `unauthenticated` with
nothing sent, but an explicit `AnonymousIdentity` object is sent (the D29
escape, IR2t #782 criterion 3). The node-tool contract says "Absent or
anonymous: the tool is read-only", and the hidden tests pass an
`AnonymousIdentity` too. So the node-tool reference maps
`config.identity` to `"anonymous"` when it is absent **or** its principal is
anonymous; `identity: config.identity ?? "anonymous"` would send the transfer.
DX3's guide has to teach this mapping (it is the same trap for an agent).

### The `AuthLike` adapter (react-wallet, Q14)

The protected `src/auth.ts` `WalletAuth` has a synchronous `getIdentity()`
and `isAuthenticated()`; `AuthLike` is `@icp-sdk/auth` 10's `AuthClient`
shape (IR1 #779). The port's adapter, which DX3's guide also shows:

```ts
function walletAuthLike(auth: WalletAuth): AuthLike {
  const signedIn = () =>
    auth.isAuthenticated() && !auth.getIdentity().getPrincipal().isAnonymous()
  return {
    getPrincipal: () =>
      signedIn() ? auth.getIdentity().getPrincipal() : undefined,
    getStatus: () => ({ state: signedIn() ? "signed-in" : "signed-out" }),
    getIdentity: async () => auth.getIdentity(),
    subscribe: (listener) => auth.subscribe(listener),
    signIn: () => auth.login(),
    signOut: () => auth.logout(),
  }
}
```

No `dispose`: the wallet does not own `WalletAuth`, and the client calls
`auth.dispose?.()` on its own disposal.

## node-tool

### `solutions/v4/reference/src/index.ts`

From `solutions/v4-proto/reference/src/index.ts`:

1. Imports: `createClient`, `isReactorError`, `parseUnits` from
   `@ic-reactor/core`; `isPrincipal` from `@candid-core/schema`;
   `actor`, `type Actor` from `./generated/icrc1`.
2. `parseAmount(text)`: `try { units = parseUnits(text, 8) } catch { return
undefined }`, then `units <= NAT64_MAX ? units : undefined` (the cap
   above).
3. `createClient({ network: { host: config.host, rootKey: config.rootKey },
identity: writer })` with `writer` = `config.identity` when present and
   not anonymous, else `"anonymous"` (the trap above). The root key rule is
   the client's (Q4): a given `rootKey` is never fetched over, a missing one
   is fetched only from a local host; the reference passes `config.rootKey`
   through and does nothing else.
4. `client.canister<Actor>(actor, { id: config.canisterId })`.
5. `getBalance(owner)`: `isPrincipal(owner)` else `TypeError`; then
   `ledger.icrc1_balance_of({ owner, subaccount: null })`.
6. `transfer({ to, amount })`: the same two refusals in the same order
   (amount, then recipient with `isPrincipal`), then
   `await ledger.icrc1_transfer({ to: { owner: to, subaccount: null }, amount:
units, fee: null, memo: null, from_subaccount: null, created_at_time:
null })` → `{ ok: true, blockIndex }`.
7. The `catch` is unchanged: `isReactorError(error)` else rethrow;
   `mayHaveExecuted: error.mayHaveExecuted`; the reason prefixes
   `canister_err` with `ledger refused:`. An `unauthenticated` rejection
   (signed out) arrives here with `mayHaveExecuted: false`, as v4-proto's
   did. The client re-sends only a retryable `not_delivered` (reject code 2,
   HTTP 429; Q9), so the reference adds no retry.

### `solutions/v4/reference-module-scope/src/index.ts`

The `reference` above plus v4-proto's module-scope `Map<string, Client>`
keyed by `host|principal` (`"anonymous"` for the read-only case), unchanged:
one client per replica and identity, built on first use, never disposed.

### `faulty/v4-never-may-have-executed` (from `v4-proto-never-may-have-executed`)

The v4 `reference` with `mayHaveExecuted: error.mayHaveExecuted` replaced by
`mayHaveExecuted: false`. Bug text unchanged. Expected failures:
`reject_code_4_classified`, `reject_code_5_classified`,
`lost_reply_classified`.

### `faulty/v4-refuses-nat64-max` (from `v4-proto-refuses-nat64-max`)

The v4 `reference` with the cap written `units < NAT64_MAX` instead of
`units <= NAT64_MAX`. Bug text unchanged. Expected failure:
`accepts_nat64_max`.

## react-wallet

### `solutions/v4/reference/src/Wallet.tsx`

From `solutions/v4-proto/reference/src/Wallet.tsx`:

1. `Wallet({ auth, config })` renders
   `<ReactorProvider client={() => createClient({ network: { host:
config.host, rootKey: config.rootKey }, auth: () => walletAuthLike(auth)
})}>` around the view. The provider runs the factory once per mounted
   tree and disposes the client on unmount (D31, #780): this replaces
   v4-proto's `useState(() => new QueryClient())` and the
   `useMemo(createClient)` keyed on `[auth, config.host, config.rootKey]`.
   The hidden tests never re-render one `Wallet` with other props (they
   unmount and render afresh), so the provider needs no `key`; an app whose
   `auth` or `config` can change keys the provider on them.
2. `WalletView({ canisterId })`: `const client = useClient()`;
   `const ledger = client.canister<Actor>(actor, { id: canisterId })` (no
   `useMemo`: memoized by the client); `const { status, principal: caller } =
useAuth()`; `const signedIn = status === "signed-in"`.
3. Balance: `useQuery(client.queryOptions(ledger, "icrc1_balance_of",
signedIn ? { owner: principal(caller), subaccount: null } : skipToken))`.
   `principal(caller)` brands the text `useAuth` returns (#779 types it
   `string`; drop the call if #782 narrows it to `Principal`). The key holds
   the caller (D17), so a switch never shows the previous principal's
   balance and no `placeholderData` is set.
4. Transfer: `useMutation(client.mutationOptions(ledger, "icrc1_transfer"))`;
   the default invalidation re-reads the balance after success, after
   `canister_err` and after any `mayHaveExecuted` failure (Q10, #782),
   which is what `invalidates: [ledger.icrc1_balance_of]` did.
5. `onSubmit`: the same refusals in the same order and words (signed out;
   amount through the `parseAmount` of the node-tool port; recipient
   `isPrincipal(to.trim())`), then `transfer.mutate({ to: { owner: recipient,
subaccount: null }, amount: units, fee: null, memo: null,
from_subaccount: null, created_at_time: null })`.
6. `state`, the buttons, the inputs, `transfer-status` and its text are
   unchanged (`transfer.error.mayHaveExecuted`, `transfer.error.kind ===
"canister_err"`, `transfer.error.err.tag`; `transfer.error` is typed
   `ReactorError<TransferError> | null`, #782 criterion 13).
7. Balance text: `formatUnits(balance.data, 8, { minFractionDigits: 8 })`
   in place of `formatE8s`.

### `solutions/v4/reference-module-scope/src/Wallet.tsx`

v4-proto's variant keeps one `QueryClient` and one client at module scope,
built on first render (`shared ??= createClient(...)`). In v4 the client owns
its `QueryClient`, so only the client is kept. **Decide at port time:**
`ReactorProvider` disposes the client its factory returns when the tree
unmounts (#780), which would kill a module-scope client after the first
test. Unless #780 ships a way to hand the provider a client it does not own,
this variant does not use the provider: it renders `<QueryClientProvider
client={shared.queryClient}>`, passes `shared` down, and reads the auth state
with `useSyncExternalStore(shared.subscribe, shared.authState)` instead of
`useAuth()` (which needs the provider). Everything else is the `reference`.

### `faulty/v4-retry-spread` (from `v4-proto-retry-spread`)

`useMutation({ ...client.mutationOptions(ledger, "icrc1_transfer"), retry: 3 })`.
Still compiles (the known hole, Q9 and D36; #782 criterion 13 pins it).
TanStack then re-sends every rejected transfer, including after a lost
reply. Expected failures: `canister_err_not_resent`,
`reject_code_4_not_resent`, `reject_code_5_not_resent`,
`lost_reply_not_resent`, `lost_reply_is_unknown`,
`lost_reply_rereads_balance`.

### `faulty/v4-keep-previous-data` (from `v4-proto-keep-previous-data`)

`useQuery({ ...client.queryOptions(ledger, "icrc1_balance_of", ...),
placeholderData: keepPreviousData })` (`keepPreviousData` from
`@tanstack/react-query`). Also a recorded hole (#782 criterion 13). Expected
failure: `no_stale_balance_after_identity_switch`. v4's cancellation of a
read whose principal is no longer current (D20) may change which stale-balance
tests fail; if it does, record why (rules above).

### `faulty/v4-every-reject-unknown` (from `v4-proto-every-reject-unknown`)

`transfer.error.mayHaveExecuted || transfer.error.kind === "rejected"` in the
`state` rule. v4 classifies reject codes 1 and 3 as `rejected` with
`mayHaveExecuted: false` and code 2 as `not_delivered` (IR3 #775), as
v4-proto did. Expected failures: `reject_code_1_is_error`,
`reject_code_3_is_error`.

### `faulty/v4-status-not-idle` (from `v4-proto-status-not-idle`)

`: transfer.status === "idle" ? "" : transfer.status` in the `state` rule.
UI only, unaffected by the library. Expected failure: `status_starts_idle`.

## After the port

- README: the conditions table gets the `v4` row's word count, the gate line
  becomes 55/55, and the faulty-solution table gets the six `v4-` rows.
- `node harness/check-docs.mjs` (its default list includes
  `conditions/v4/docs/llms.txt`) and `node setup.mjs` must pass with DX3's
  guide in the packed core tarball.
- PREREGISTRATION.md Addendum 3 is frozen (its conditions are listed there)
  before any v4 agent run.
