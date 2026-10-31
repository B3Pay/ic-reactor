---
title: Canister
editUrl: false
next: true
prev: true
---

> **Canister**\<`A`\> = `{ readonly [K in keyof A]: A[K] extends (args: infer P) => Promise<infer R> ? (args: P) => Promise<Unwrap<R>> : never }` & `object`

Defined in: [core/src/types.ts:208](https://github.com/B3Pay/ic-reactor/blob/ce557f08e58ca542badaab65172d569c0ec0c62a/packages/core/src/types.ts#L208)

A canister, as `client.canister<Actor>(actor, target)` returns it: a frozen
object with one plain async method per Candid method of the service, typed
from the generated `Actor`.

Each method encodes its arguments with the service schema, sends the call
as the caller signed in at the moment it is called, decodes the reply, and
resolves with it the way the generated `Actor` types it: `undefined` for a
method with no results, the value for one, the tuple for several. A method
whose one result is an `Ok`/`Err` variant resolves with the `Ok` payload and
rejects the `Err` one as a `ReactorError` of kind `"canister_err"`, whose
`err` is typed.

Every failure rejects with a `ReactorError`; read `mayHaveExecuted` before
trying a write again. An update re-sends itself only when the failure proves
the first attempt never got in (reject code 2, or HTTP 429, from any
canister but `aaaaa-aa`), at most twice; a direct read re-sends only after a
failure the classifier marks retryable, at most twice.

## Type Declaration

### \[actorType\]?

> `readonly` `optional` **\[actorType\]?**: `A`

## Type Parameters

### A

`A`

## Example

```ts
import { actor, type Actor } from "./canisters/icrc1"

const ledger = client.canister<Actor>(actor, { id: "ryjl3-tyaaa-aaaaa-aaaba-cai" })
const fee = await ledger.icrc1_fee()
```
