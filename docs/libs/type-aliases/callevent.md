---
title: CallEvent
editUrl: false
next: true
prev: true
---

> **CallEvent** = \{ `phase`: `"start"`; `id`: `number`; `via`: `"query"` \| `"mutation"` \| `"direct"` \| `"func"`; `canisterId`: `string`; `method`: `string`; `mode`: `"query"` \| `"composite_query"` \| `"update"` \| `"oneway"`; `certified`: `boolean`; `caller`: `string`; `args`: readonly `unknown`[]; `resendOf`: `boolean`; `at`: `number`; \} \| \{ `phase`: `"success"`; `id`: `number`; `data`: `unknown`; `sends`: `number`; `ms`: `number`; \} \| \{ `phase`: `"error"`; `id`: `number`; `error`: [`ReactorError`](/docs/ic-reactor/libs/type-aliases/reactorerror/)\<`unknown`\>; `sends`: `number`; `ms`: `number`; \} \| \{ `phase`: `"cancelled"`; `id`: `number`; `error`: [`ReactorError`](/docs/ic-reactor/libs/type-aliases/reactorerror/)\<`unknown`\>; `sends`: `number`; `ms`: `number`; \}

Defined in: [core/src/client.ts:332](https://github.com/B3Pay/ic-reactor/blob/faea96d6979f27f7ffa20d39c211a7bba7bbc30f/packages/core/src/client.ts#L332)

One event of a canister call, as [Client.onCall](/docs/ic-reactor/libs/interfaces/client/#oncall) hands it to a
listener. A call is two events with the same `id`: a `start`, and then
exactly one of `success`, `error` and `cancelled`.

Narrow on `phase`. The `start` says what was called, how and as whom; the
end says what became of it, and repeats nothing of the start, so a listener
that wants both keeps the start by its `id` until the end arrives.

`args` and `data` are handed over as they are, not copied: they are the
objects the app gave and the caller receives, they may hold personal data,
and a listener must not change them. No event holds an identity, a
delegation, a signature or the bytes of a request, and the client keeps no
event.

## Union Members

### Type Literal

\{ `phase`: `"start"`; `id`: `number`; `via`: `"query"` \| `"mutation"` \| `"direct"` \| `"func"`; `canisterId`: `string`; `method`: `string`; `mode`: `"query"` \| `"composite_query"` \| `"update"` \| `"oneway"`; `certified`: `boolean`; `caller`: `string`; `args`: readonly `unknown`[]; `resendOf`: `boolean`; `at`: `number`; \}

#### phase

> `readonly` **phase**: `"start"`

The call was made. Its end comes in a later event with the same `id`.

#### id

> `readonly` **id**: `number`

Pairs this event with the one that ends the call. Unique among the
calls of a client and its views, and never used again.

#### via

> `readonly` **via**: `"query"` \| `"mutation"` \| `"direct"` \| `"func"`

What made the call: `"query"` for the query function of
[Client.queryOptions](/docs/ic-reactor/libs/interfaces/client/#queryoptions), `"mutation"` for the mutation function
of [Client.mutationOptions](/docs/ic-reactor/libs/interfaces/client/#mutationoptions), `"direct"` for a method of a
canister object and for the `send()` of [Client.resendOf](/docs/ic-reactor/libs/interfaces/client/#resendof), and
`"func"` for a function of [Client.func](/docs/ic-reactor/libs/interfaces/client/#func).

#### canisterId

> `readonly` **canisterId**: `string`

The canister called, as text: its id, or `$unresolved:<name>` for a
`{ name }` the `ic_env` cookie does not resolve, as a
`ReactorError`'s `canisterId` says it.

#### method

> `readonly` **method**: `string`

The Candid method called.

#### mode

> `readonly` **mode**: `"query"` \| `"composite_query"` \| `"update"` \| `"oneway"`

The method's mode in the service's interface.

#### certified

> `readonly` **certified**: `boolean`

Whether this is a certified read: a `query` method of a canister made
with `certified: true`, which is sent as a replicated call.

#### caller

> `readonly` **caller**: `string`

The principal the call is made as, as text: the only one it is ever
signed by. For a write refused because nobody knows who started it,
the caller current when it was refused.

#### args

> `readonly` **args**: readonly `unknown`[]

The arguments, as a list, as the app gave them: not copied, not encoded.

#### resendOf

> `readonly` **resendOf**: `boolean`

Whether the call sends again a write [Client.resendOf](/docs/ic-reactor/libs/interfaces/client/#resendof) offered.

#### at

> `readonly` **at**: `number`

When the call was made: `Date.now()` then.

***

### Type Literal

\{ `phase`: `"success"`; `id`: `number`; `data`: `unknown`; `sends`: `number`; `ms`: `number`; \}

#### phase

> `readonly` **phase**: `"success"`

The call resolved.

#### id

> `readonly` **id**: `number`

The `id` of the call's `start` event.

#### data

> `readonly` **data**: `unknown`

What the caller receives: the reply as the generated `Actor` types
it, with the `Ok` payload in place of a result variant.

#### sends

> `readonly` **sends**: `number`

How many requests the call sent: 1, or more when a request failed in
a way that proves it was not delivered and the client sent the call
again. The call's own requests count, a query or a call request, and
not the reads of an update's status that follow one.

#### ms

> `readonly` **ms**: `number`

How long the call took, in milliseconds, on a clock that only moves forward.

***

### Type Literal

\{ `phase`: `"error"`; `id`: `number`; `error`: [`ReactorError`](/docs/ic-reactor/libs/type-aliases/reactorerror/)\<`unknown`\>; `sends`: `number`; `ms`: `number`; \}

#### phase

> `readonly` **phase**: `"error"`

The call rejected, with any `ReactorError` but a cancellation: a
`canister_err` (whose `err` is the canister's `Err`), and a
`timeoutMs` that passed (code `"timeout"`) among them.

#### id

> `readonly` **id**: `number`

The `id` of the call's `start` event.

#### error

> `readonly` **error**: [`ReactorError`](/docs/ic-reactor/libs/type-aliases/reactorerror/)\<`unknown`\>

What the caller receives. `isReactorError(error, canister, method)`
types its `err`.

#### sends

> `readonly` **sends**: `number`

How many requests the call sent: 0 when nothing was sent, because
the client refused the call first or the signer declined to sign it.
A request counts once, also one the client sent again unchanged
while it read back a lost answer.

#### ms

> `readonly` **ms**: `number`

How long the call took, in milliseconds, on a clock that only moves forward.

***

### Type Literal

\{ `phase`: `"cancelled"`; `id`: `number`; `error`: [`ReactorError`](/docs/ic-reactor/libs/type-aliases/reactorerror/)\<`unknown`\>; `sends`: `number`; `ms`: `number`; \}

#### phase

> `readonly` **phase**: `"cancelled"`

The call was given up: it rejected `cancelled` with any code but
`"timeout"`, such as `caller_changed`, `client_disposed`, or none for
a query whose signal aborted (its observer left, or the query was
removed while it fetched).

#### id

> `readonly` **id**: `number`

The `id` of the call's `start` event.

#### error

> `readonly` **error**: [`ReactorError`](/docs/ic-reactor/libs/type-aliases/reactorerror/)\<`unknown`\>

What the caller receives: its `code` says why.

#### sends

> `readonly` **sends**: `number`

How many requests the call sent: 0 when nothing was sent.

#### ms

> `readonly` **ms**: `number`

How long the call took, in milliseconds, on a clock that only moves forward.

## Example

```ts
const methods = new Map<number, string>()
client.onCall((event: CallEvent) => {
  if (event.phase === "start") {
    methods.set(event.id, event.method)
  } else {
    console.log(methods.get(event.id), event.phase, Math.round(event.ms))
    methods.delete(event.id)
  }
})
```
