# Porting the v4-proto solutions to `v4`

What DX5's second phase (issue #786) ported: the two tasks' v4-proto
reference solutions and the six v4-proto faulty solutions, rewritten against
ic-reactor 4, plus one faulty solution of v4's own for a trap the port
found. The work list was written on 2026-10-02 against the
**planned** API (SCOPE item 1, DECISIONS Q1 to Q14, and the slices that build
it: IR1 #779, IR6 #780, IR2t #782, IR5 #777, IR3 #775). The port was made the
same day against the API **as built** (`packages/core/src`,
`packages/react/src` with all five slices merged), and this file now records
it: where the port differs from the plan, the section says so under "As
ported".

**Result.** All four references, all six ported faulty solutions and one
v4-only faulty solution are in the tree. `node gate.mjs --require v4`
reports 56 of 56 (45 + 4 references + 6 ports + 1 v4-only), no cell
skipped. Each ported faulty solution fails exactly the tests its v4-proto
original fails: no fault had to be dropped or changed, so the real library
closed none of the six traps the prototype left open
(`harness/gate-plan.test.mjs` checks that each port's `expectFail` equals
its original's). It opened two the prototype did not. An explicit
`AnonymousIdentity` is sent (below), which
`node-tool/faulty/v4-anonymous-identity-sent` carries as a gate cell. A
module-scope client handed to `ReactorProvider` is disposed under later
trees (react-wallet's module-scope variant, below), which is recorded as a
question for the lead rather than as a gate cell.

## Rules for the port

- **Check the scorer first.** Before scoring the first port, run
  `node setup.mjs` and `node --test harness/ship.test.mjs`, which checks
  that the scorer loads one instance of `@icp-sdk/core`. The world
  (`world.ts`, `fake-auth.ts`, the 3.13.0 fake replica) imports it from
  evals' install; the solution, the hidden tests and the v4 packages import
  it from `conditions/v4/node_modules`, where setup makes it a link to
  evals' copy (`conditions/v4/README.md`, step 6). A reference failure that
  looks like a class or identity mismatch (fake-auth's signed-out
  `AnonymousIdentity` not seen as anonymous, a `Principal` not recognised)
  points at that link before the library. Nothing else crosses: the 3.13.0
  fake replica only answers `fetch`, and v4's error classification reads
  names and codes, never `instanceof` (`packages/core/src/errors.ts`).
  _As ported:_ done first; `ship.test.mjs` passed, and no reference failure
  of that kind showed up.
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
  scope"). _As ported:_ no set changed.
- **The gate.** `node gate.mjs --require v4` must then report 45 + 4 + 6 =
  55 of 55 (56 of 56 with the v4-only faulty solution added after the
  port). `--require v4` fails the gate before scoring while either task's
  `v4` cell has no reference, and a ported faulty solution in a task whose
  `v4` references are missing fails it even without the flag, so a port
  left half done cannot pass.
- **Imports.** `@ic-reactor/core` (`createClient`, `isReactorError`,
  `parseUnits`, `formatUnits`, types `AuthLike`, `Client`);
  `@ic-reactor/react` (`ReactorProvider`, `useClient`, `useAuth`);
  `@candid-core/schema` (`isPrincipal`, `principal`: the only import path
  for Candid values, D35); `@tanstack/react-query` (`useQuery`,
  `useMutation`, `skipToken`, and `QueryClientProvider` in the react
  module-scope variant); `./generated/icrc1` (`actor`, `type Actor`);
  `@icp-sdk/core/agent` (`type Identity`, node-tool only, for the
  anonymous mapping below). There is no `icrc1.service.ts`: the v4
  condition's starter holds only the CLI's `icrc1.ts`, and no mode map
  exists in v4 (CC2 was dropped). No port names `ReactorError` or
  `Principal`: both are inferred (`transfer.error` is
  `ReactorError<TransferError> | null` from the options, and `isPrincipal`
  narrows text to `Principal`).

## API map

| v4-proto (prototype)                                                                 | v4 (as built)                                                                                                                                                                                   | Decided by                    |
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
| `useSyncExternalStore(client.subscribe, client.caller)` + `client.isAuthenticated()` | `const { status, principal, signIn, signOut } = useAuth()`; signed in exactly when `status === "signed-in"`                                                                                     | Q11; #780                     |
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
_As ported:_ confirmed. With that one line in place of the mapping, the
reference fails `no_anonymous_update`, and only it: the `AnonymousIdentity`
tool's transfer reaches the ledger. v4-proto had no such trap (its
client refused every update whose caller principal was anonymous, however
the identity was given: `conditions/v4-proto/lib/src/client.ts`), so no
port carries it; `faulty/v4-anonymous-identity-sent` (below) is the
reference with that one line, and the gate carries it like the ports.

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
`auth.dispose?.()` on its own disposal. _As ported:_ exactly this, in both
react-wallet references; it type-checks against the built `AuthLike` with no
annotation beyond the return type.

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

_As ported:_ as planned. The mapping is a function, `writerOf(identity)`,
which is where the `type Identity` import comes from. `isPrincipal` narrows
`owner` and `to` to `Principal`, so the generated `Account` takes them with
no `principal()` call.

### `solutions/v4/reference-module-scope/src/index.ts`

The `reference` above plus v4-proto's module-scope `Map<string, Client>`
keyed by `host|principal` (`"anonymous"` for the read-only case), unchanged:
one client per replica and identity, built on first use, never disposed.
_As ported:_ as planned; the key's principal part is the mapped writer's, so
an absent identity and an `AnonymousIdentity` share the read-only client.

### `faulty/v4-never-may-have-executed` (from `v4-proto-never-may-have-executed`)

The v4 `reference` with `mayHaveExecuted: error.mayHaveExecuted` replaced by
`mayHaveExecuted: false`. Bug text unchanged. Expected failures:
`reject_code_4_classified`, `reject_code_5_classified`,
`lost_reply_classified`. _As ported:_ fails exactly these.

### `faulty/v4-refuses-nat64-max` (from `v4-proto-refuses-nat64-max`)

The v4 `reference` with the cap written `units < NAT64_MAX` instead of
`units <= NAT64_MAX`. Bug text unchanged. Expected failure:
`accepts_nat64_max`. _As ported:_ fails exactly this.

### `faulty/v4-anonymous-identity-sent` (v4 only, no original)

The v4 `reference` with `identity: writerOf(config.identity)` replaced by
`identity: config.identity ?? "anonymous"` (and the then unused `writerOf`
and `Identity` import removed): the line an agent writes when it reads
"absent: anonymous" and stops there. Expected failure:
`no_anonymous_update`, the same test `thin-anonymous-transfer` fails in the
thin condition. Added after review, so that the gate shows the hidden tests
catch this trap of the real library. _Measured:_ fails exactly this
(tsc clean); with the mapping put back, the gate reports the cell `FAIL`
with nothing failed.

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

_As ported:_ as planned, with one difference in step 6: the sign-in and
sign-out buttons call `signIn()` and `signOut()` from `useAuth()` instead of
`auth.login()` and `auth.logout()`. The view no longer receives `auth`; the
client forwards both calls to the adapter, which calls the wallet's own. The
buttons' test ids, labels and visibility are unchanged. `AuthState.principal`
is still typed `string`, so `principal(caller)` stays.

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

_Decided:_ no provider, as above. #780 shipped no way to give
`ReactorProvider` a client it does not own: it disposes whatever its factory
returned when the tree unmounts, and a later mount that finds that client
disposed calls the factory again, which for a module-scope client returns the
same disposed client, so every call after the first test would be cancelled.
Measured, not only read: a scratch variant that hands the module-scope client
to `ReactorProvider` (`client={() => (shared ??= createClient(...))}`, the
rest as the `reference`) type-checks clean and fails 30 of the 32 hidden
tests; only the first test that renders it and one that sends nothing pass.
The provider keeps the disposed client without a word, so an agent that
writes this sees no error, only a wallet that stops calling.
The variant therefore renders `QueryClientProvider` with
`shared.queryClient`, passes `shared` to the view, reads
`useSyncExternalStore(shared.subscribe, shared.authState)`, and its buttons
call `shared.signIn()` and `shared.signOut()`. All of these are the public
`Client` API. This is the one place a v4 React app that keeps v3's
module-scope idiom cannot use `useClient`/`useAuth`; the guide should say so
if it shows a module-scope client at all.

This is a library behaviour, not a port decision, so it went to the lead as
an open question (#780 for the provider, DX3 #785 for the guide); no
`packages/**` change was made here. Two paths lead to it, both in
`ReactorProvider` (`packages/react/src/index.tsx`). A later tree's provider
cannot cancel the earlier tree's pending disposal, which is held per
provider instance, so the earlier tree's timer disposes the shared client
under the later tree. And once the client is disposed, a provider that
mounts with it takes the path meant for a re-shown `Activity`: it calls the
factory again, gets the same disposed client back, and keeps it, without an
error or a warning. Whether the provider should throw or warn when its factory
returns a client it has disposed, or refuse a client it did not build, is
the lead's call; until then the guide must not show a module-scope client
handed to `ReactorProvider`.

### `faulty/v4-retry-spread` (from `v4-proto-retry-spread`)

`useMutation({ ...client.mutationOptions(ledger, "icrc1_transfer"), retry: 3 })`.
Still compiles (the known hole, Q9 and D36; #782 criterion 13 pins it).
TanStack then re-sends every rejected transfer, including after a lost
reply. Expected failures: `canister_err_not_resent`,
`reject_code_4_not_resent`, `reject_code_5_not_resent`,
`lost_reply_not_resent`, `lost_reply_is_unknown`,
`lost_reply_rereads_balance`. _As ported:_ fails exactly these. The bug text
now says that the spread overrides the options' `retry: false` (v4-proto's
options had no `retry` at all).

### `faulty/v4-keep-previous-data` (from `v4-proto-keep-previous-data`)

`useQuery({ ...client.queryOptions(ledger, "icrc1_balance_of", ...),
placeholderData: keepPreviousData })` (`keepPreviousData` from
`@tanstack/react-query`). Also a recorded hole (#782 criterion 13). Expected
failure: `no_stale_balance_after_identity_switch`. v4's cancellation of a
read whose principal is no longer current (D20) may change which stale-balance
tests fail; if it does, record why (rules above). _As ported:_ fails exactly
this; D20 changed nothing. The in-flight switch test still passes, because
`keepPreviousData` shows the data of the key the observer last held, and the
observer moved to the new principal's key before the old principal's read
landed: there was no previous data to keep. After sign-in and sign-out the
previous key is the skipped read's, which holds none either.

### `faulty/v4-every-reject-unknown` (from `v4-proto-every-reject-unknown`)

`transfer.error.mayHaveExecuted || transfer.error.kind === "rejected"` in the
`state` rule. v4 classifies reject codes 1 and 3 as `rejected` with
`mayHaveExecuted: false` and code 2 as `not_delivered` (IR3 #775), as
v4-proto did. Expected failures: `reject_code_1_is_error`,
`reject_code_3_is_error`. _As ported:_ fails exactly these.

### `faulty/v4-status-not-idle` (from `v4-proto-status-not-idle`)

`: transfer.status === "idle" ? "" : transfer.status` in the `state` rule.
UI only, unaffected by the library. Expected failure: `status_starts_idle`.
_As ported:_ fails exactly this.

## After the port

- README: the gate line is 56/56 and the faulty-solution table has the
  seven `v4-` rows. The conditions table's `v4` word count stays the
  placeholder's until DX3's guide is packed.
- `node harness/check-docs.mjs` (its default list includes
  `conditions/v4/docs/llms.txt`) and `node setup.mjs` must pass again with
  DX3's guide in the packed core tarball, and `node gate.mjs --require v4`
  must be run again on the commit under test: the references do not read
  the guide, but they do run against the packed packages.
- PREREGISTRATION.md Addendum 3 is frozen (its conditions are listed there)
  before any v4 agent run.
