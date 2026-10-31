---
title: TestHandlers
editUrl: false
next: true
prev: true
---

> **TestHandlers**\<`A`\> = \{ \[K in keyof A\]?: A\[K\] extends (args: infer P) =\> Promise\<infer R\> ? (args: \[...P, ctx: \{ caller: Principal \}\]) =\> R \| Promise\<R\> : never \}

Defined in: [core/src/testing/test-client.ts:71](https://github.com/B3Pay/ic-reactor/blob/446056396ae198c16deb1c6c0e34d34920e9b9ec/packages/core/src/testing/test-client.ts#L71)

The handlers of a mocked canister, typed from the generated `Actor` of its
module: one optional function per method.

A handler takes the method's arguments as domain values (`bigint` for a
`nat`, checked principal text for a `principal`, `{ tag, value }` for a
variant) and then a context, `{ caller }`: the principal that sent the call,
as checked principal text, after the fake replica verified its signature. It
returns what the method returns, or a promise of it. A handler that returns
a `number` for a `nat` does not compile.

Handlers speak the canister's shapes, not the client's. For a method whose
one result is an `Ok`/`Err` variant a handler returns `{ tag: "Ok", value }`
or `{ tag: "Err", value }`, and the client unwraps it: the call resolves with
the `Ok` payload, or rejects `canister_err` with the `Err` one. For a method
with several results a handler returns the tuple, and for one with none it
returns nothing.

## Type Parameters

### A

`A`

## Example

```ts
import { actor, type Actor } from "./canisters/icrc1"

const handlers: TestHandlers<Actor> = {
  icrc1_fee: () => 10_000n,
  icrc1_balance_of: ({ owner }, { caller }) => (owner === caller ? 5n : 0n),
}
```
