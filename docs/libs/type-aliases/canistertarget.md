---
title: CanisterTarget
editUrl: false
next: true
prev: true
---

> **CanisterTarget** = (\{ `id`: `string`; `name?`: `never`; \} \| \{ `name`: `string`; `id?`: `never`; \}) & `object` & (\{ `anonymous?`: readonly `string`[]; `attributes?`: `never`; \} \| \{ `attributes`: \{ `data`: `Uint8Array`; `signature`: `Uint8Array`; `signer?`: `string`; \}; `anonymous?`: `never`; \})

Defined in: [core/src/types.ts:270](https://github.com/B3Pay/ic-reactor/blob/6ce878615e2c977957a28a7b7cd9caa1826df7c9/packages/core/src/types.ts#L270)

Which canister `client.canister()` calls: by its id, or by the name the
`ic_env` cookie gives it.

- `{ id }`: principal text. Text that is not a canonical principal throws a
  `TypeError` that names it, when the canister is made.
- `{ name }`: read from the cookie's `PUBLIC_CANISTER_ID:<name>` entry when a
  call or a key is built, and only where the network trusts the cookie.
  Unresolved (on a server, on an untrusted host, or with no such entry),
  every call rejects `invalid_args` with code `"canister_id_unresolved"` and
  sends nothing, and keys carry `"$unresolved:<name>"` in place of the id.
- `certified: true` makes another canister object, whose `query` methods are
  sent as replicated calls so that their replies are certified, and whose
  keys end in `"certified"`. A `composite_query` has no certified path: on
  such a canister its direct call rejects `invalid_args` (code
  `"no_certified_path"`) and `queryOptions` throws a `TypeError`.
- `timeoutMs` bounds how long each call made through the canister object
  waits for its answer, from the moment it is called: its direct calls, its
  reads made with `queryOptions`, its mutations (unless `mutationOptions`
  gives its own), and `client.time()` on it. Without it, a request that gets
  no HTTP answer waits as long as the `fetch` in use does. When it passes,
  the call rejects with code `"timeout"`: `cancelled` with `mayHaveExecuted:
  false` for a read, and for a write before its request went out; a write
  whose request went out (an `{ update: "idempotent" }` read's included), or
  a re-send of a write `client.resendOf()` offered at any point, rejects
  `outcome_unknown` with `mayHaveExecuted: true`, an unknown outcome to
  reconcile (read the state back, or `client.resendOf()` with this same
  canister object), never one to send again blindly. Nothing is sent again
  for it, and the request itself is not torn down: only the waiting stops. A
  number of milliseconds from 1 to 2147483647; anything else throws a
  `TypeError`. Another `timeoutMs` makes another canister object, with the
  same keys: a read observed through two of them is bounded by the options
  TanStack Query was given last.
- `anonymous` names the updates anyone may send (a canister's sign-in
  nonce, say): on the canister object it makes, each of them goes out as
  the anonymous principal, whoever is signed in and when nobody is,
  directly or through `mutationOptions`. `queryOptions` refuses an
  `{ update: "idempotent" }` read of one, whose key would hold a caller it
  is not sent as. Every other method is called as on any
  canister object, so a write nobody named is still refused
  (`unauthenticated`) while nobody is signed in. A name the service has no
  method for, or one of a `query` or `composite_query` (which a signed-out
  client sends already), throws a `TypeError` when the canister is made.
- `attributes` makes a canister object whose calls carry signed identity
  attributes as their `sender_info`, signed by the caller: what
  `client.requestAttributes()` resolved with, for the canister that checks
  them and no other. `signer` is the canister that signed them, as
  principal text: left out, it is the network's identity provider, which on
  mainnet is Internet Identity (`rdmx6-jaaaa-aaaaa-aaadq-cai`); where the
  network names none, making the canister without one throws a
  `TypeError`. Such a canister object is for direct calls and
  `mutationOptions`: `queryOptions` refuses it, since a read made with
  attributes would share its key with the one made without. The same
  attributes object gives the same canister object. Not together with
  `anonymous`.

## Type Declaration

### certified?

> `readonly` `optional` **certified?**: `boolean`

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`
