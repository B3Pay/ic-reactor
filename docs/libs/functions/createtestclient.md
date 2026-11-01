---
title: createTestClient
editUrl: false
next: true
prev: true
---

> **createTestClient**(`options?`): `object`

Defined in: [core/src/testing/test-client.ts:265](https://github.com/B3Pay/ic-reactor/blob/7c822a725a135ee579b83982997d6233fd39e3e7/packages/core/src/testing/test-client.ts#L265)

Creates a client for a test: a real one, over a fake replica, signed in as
a principal the test picks and can change.

```ts
const { client, auth, mock } = createTestClient()
mock<Actor>(actor, LEDGER, {
  icrc1_balance_of: ({ owner }) => (owner === auth.getPrincipal()?.toText() ? 7n : 0n),
})
const ledger = client.canister<Actor>(actor, { id: LEDGER })
await ledger.icrc1_balance_of({ owner: me, subaccount: null }) // 7n
```

It runs the same code as production, so a test sees what an app would: a
call is signed by the principal signed in when it is made, an update by
nobody is refused before it is sent, a reply that is lost is
`outcome_unknown`. Each call is also checked as a replica checks it: a
canister's `ctx.caller` is the principal the fake verified, never a guess.

The fake replica signs with `@noble/curves`, an optional peer dependency of
`@ic-reactor/core` that `@icp-sdk/core` already installs. Add it to your
devDependencies if your package manager does not let this package resolve
it. Nothing global is replaced, `globalThis.fetch` included, so two test
clients run side by side, each with its own fake replica and sign-in.

## Parameters

### options?

Who is signed in, and optionally which network the client
believes it is on. Alone, it signs in as the identity of seed `1`.

#### identity?

`number` \| `Identity`

Who is signed in at first: an identity, which must be a real signing
identity such as `Ed25519KeyIdentity`, or a number that stands for one
(the same number is the same principal in every run, on every machine).

**Default Value**

The identity of seed `1`.

#### signedIn?

`boolean`

Whether the client starts signed in. When `false` it starts signed out,
calls as the anonymous principal (every update is refused), and
`auth.signIn()` signs in as `identity`.

**Default Value**

```ts
true
```

#### network?

[`Network`](/docs/ic-reactor/libs/type-aliases/network/)

Which network the client believes it is on, for the parts a test can see:
the network segment of its query keys and the host it connects to. The
fake replica answers on that host. The root key is always the fake's own:
a `rootKey` or `fetchRootKey` in a network object is ignored, and `"ic"`
does not check certificates against mainnet's key, which the fake cannot
sign with. Give the host with a scheme.

**Default Value**

```ts
A replica on the fake's own host.
```

#### allowEnvConfig?

`boolean`

Whether the `ic_env` cookie is believed, as for `createClient`. It
matters only to a test that resolves `{ name }` canisters from a cookie
it set up, and a `{ name }` canister resolves only on a page (in jsdom
or happy-dom), never in Node, which is where a test client runs by
default: a Node test names its canisters with `{ id }`. The root key is
never taken from the cookie: it is the fake's own.

#### maxDepth?

`number`

How deep a decoded value may nest, for the client and for the mocks. Defaults to 256.

#### maxElements?

`number`

How many values a decoded value may hold beyond one per byte, for the
client and for the mocks. Defaults to 1,000,000.

## Returns

The client, its sign-in, the means to mock canisters and to fail a
call on purpose, and the log of the requests the fake received.

### client

> `readonly` **client**: [`Client`](/docs/ic-reactor/libs/interfaces/client/)

A real client (`createClient`'s) whose agents send through the fake
replica, and whose auth is `auth`. Unlike a client made
by `createClient`, its auth is built in every environment, a server one
such as Node included, so signing in and out works in any test runner.
Dispose it at the end of the test, as any client.

### auth

> `readonly` **auth**: `object`

The sign-in the client calls as: `signIn`, `signOut`, `switchTo` another
identity or seed, `expire` the session, or make it `elsewhere`. The status
changes at once, and the client's next call is signed by whoever is
signed in then. The client owns it once anything has asked it who the
caller is: a call, `caller()`, `authState()`, `subscribe()`, `signIn()`,
`signOut()`, and also `queryKey()` and `queryOptions()`, which key by the
caller (a mutation from `mutationOptions()` reads it when `mutate()` is
called). It disposes it with itself then. A client disposed before any
of those never touched `auth` and leaves it alone, so a test can borrow
`auth` from a client it never used and hand it to another one.

#### auth.getPrincipal()

> **getPrincipal**(): `Principal` \| `undefined`

The principal calls are accepted as, or `undefined` unless the status is
`signed-in`: an expired or elsewhere session names a principal in
`getStatus()` but cannot act. Synchronous, and derived from
the same state as `getStatus()`, so the two never disagree.

##### Returns

`Principal` \| `undefined`

#### auth.getStatus()

> **getStatus**(): \{ `state`: `"signed-in"`; `principal`: `Principal`; `expiresAtMs`: `number`; \} \| \{ `state`: `"expired"`; `principal`: `Principal`; `expiresAtMs`: `number`; \} \| \{ `state`: `"signed-in-elsewhere"`; `principal`: `Principal`; `expiresAtMs`: `number`; \} \| \{ `state`: `"signed-out"`; \}

Who is signed in, as `AuthClient.getStatus()` reports it: its `state` is
`signed-in` (calls as `principal` are accepted), `expired` (the session of
`principal` has ended), `signed-in-elsewhere` (`principal` is signed in on
this domain, but this origin holds no credential for it, so it cannot act
yet) or `signed-out` (nobody is, and there is no `principal`).
Synchronous. The object it returns is the same one until the status
changes, so it is safe to read from `useSyncExternalStore`.

A session ends by the clock too, as `AuthClient`'s does: once `Date.now()`
reaches `expiresAtMs` (eight hours after the sign-in; advance fake timers
to get there), a `signed-in` or `signed-in-elsewhere` status reads as
`expired`, and listeners are not told, since `AuthClient` tells nobody
either. `expire()` is the explicit form, which does tell
them.

##### Returns

\{ `state`: `"signed-in"`; `principal`: `Principal`; `expiresAtMs`: `number`; \} \| \{ `state`: `"expired"`; `principal`: `Principal`; `expiresAtMs`: `number`; \} \| \{ `state`: `"signed-in-elsewhere"`; `principal`: `Principal`; `expiresAtMs`: `number`; \} \| \{ `state`: `"signed-out"`; \}

#### auth.getIdentity()

> **getIdentity**(): `Promise`\<`Identity`\>

The identity to sign calls with: the signed-in one, or
`AnonymousIdentity` in every other state, as `AuthClient` answers while
nobody is signed in.

##### Returns

`Promise`\<`Identity`\>

#### auth.subscribe()

> **subscribe**(`listener`): () => `void`

Calls `listener` after each change of who is signed in, once per change,
with no argument: read the answer from `getStatus()`.

##### Parameters

###### listener

() => `void`

##### Returns

A function that stops listening.

() => `void`

#### auth.signIn()

> **signIn**(`identityOrSeed?`): `Promise`\<`Identity`\>

Signs in as `identityOrSeed`, or as the identity the auth last signed in
as when it is left out. The status changes before the promise is
returned, so a test need not await it, and listeners are told once.

An argument that is neither a seed nor an identity, such as the options
object an `AuthClient` takes (`{ maxTimeToLive }`), is ignored: the auth
signs in as the identity it last signed in as, so a client that forwards
its own options does not change who signs in.

##### Parameters

###### identityOrSeed?

`number` \| `Identity`

##### Returns

`Promise`\<`Identity`\>

#### auth.signOut()

> **signOut**(): `Promise`\<`void`\>

Signs out. Listeners are told once, unless nobody was signed in. The
auth remembers the identity, so a later `signIn()` returns to it.

##### Returns

`Promise`\<`void`\>

#### auth.switchTo()

> **switchTo**(`identityOrSeed`): `Identity`

Signs in as another identity in one step: listeners are told once and
never see a signed-out status in between, as when a user picks another
account in the identity provider.

##### Parameters

###### identityOrSeed

`number` \| `Identity`

##### Returns

`Identity`

The identity now signed in.

##### Throws

When `identityOrSeed` is neither a seed nor an
identity: unlike `signIn()`, switching has no account to fall
back to.

#### auth.expire()

> **expire**(): `void`

Ends the session of the identity the auth last signed in as, in another
tab or by running out its time, so the status becomes `expired`.
Listeners are told once, unless it already was. A session also expires
by the clock, without telling them (see `getStatus()`).

##### Returns

`void`

#### auth.elsewhere()

> **elsewhere**(): `void`

Makes the identity the auth last signed in as signed in on this domain
but not held by this origin, so the status becomes `signed-in-elsewhere`.
Listeners are told once, unless it already was.

##### Returns

`void`

#### auth.dispose()

> **dispose**(): `void`

Releases every listener. After it the auth tells nobody, and a
`subscribe()` listens to nothing.

##### Returns

`void`

#### auth.disposed

> `readonly` **disposed**: `boolean`

Whether `dispose()` has been called.

#### auth.listenerCount

> `readonly` **listenerCount**: `number`

How many listeners are subscribed.

### mock()

> **mock**\<`A`\>(`service`, `id`, `handlers`): `void`

Runs a canister at `id`, answering with `handlers`, replacing any canister
already there. `id` is a canister id, or `aaaaa-aa` for the management
canister.

`service` is the `actor` export of the generated module and `A` its
`Actor` type, as for `client.canister<A>(service, { id })`: write
`mock<Actor>(actor, id, handlers)`. Methods answer by their mode: a
`query` method on the query path, an `update` on the call path (a `query`
method also answers a replicated call, as it does on a canister, which is
how a `certified` canister reads it). A call to a method with no handler
traps, with a message that names the method.

What goes wrong in a handler goes wrong as it does in a canister: a
handler that calls `reject()` rejects the call with that
reject code, and one that throws anything else traps it (reject code 5,
with the error's message). So does a call whose arguments do not decode
with `service`, and a handler that returns something the method's result
does not encode.

#### Type Parameters

##### A

`A`

#### Parameters

##### service

`Schema`\<`Principal`\>

##### id

`string`

##### handlers

[`TestHandlers`](/docs/ic-reactor/libs/type-aliases/testhandlers/)\<`A`\>

#### Returns

`void`

#### Throws

TypeError for a `service` that is not a service schema, an `id`
that is not a canister id, a handler that is not a function, and a handler
for a method the service does not have.

### reject()

> **reject**(`code`, `message?`): `never`

Rejects the call being handled with `code`, as a canister does: call it
from inside a handler. The reject codes are the interface specification's:
`1` SYS_FATAL, `2` SYS_TRANSIENT, `3` DESTINATION_INVALID, `4`
CANISTER_REJECT, `5` CANISTER_ERROR and `6` SYS_UNKNOWN. An update is
rejected in a certificate and a query in the signed query response.

#### Parameters

##### code

`1` \| `2` \| `3` \| `4` \| `5` \| `6`

The reject code the client receives.

##### message?

`string`

The reject message; a default naming the code is used
when it is left out.

#### Returns

`never`

### dropNextReply()

> **dropNextReply**(`options?`): `void`

Loses the reply to the next call request: the canister runs, but the
client sees a network failure instead of the answer, so an update ends as
`outcome_unknown` with `mayHaveExecuted: true`. The same request is never
run twice: the fake keeps its reply lost whenever it is asked again.

With no argument it matches whatever call request comes next, and that
includes a certified read (a `query` method on a `certified: true`
canister) and an update read with `{ update: "idempotent" }`, which go
out as calls. Such a read is not an update: the client sends it again
as a new request, which can be answered, so its handler runs again.
Given options, it loses the replies of the next `times`
call requests that name `method` and are addressed to `canister` (each
one that is given), and lets every other request through, as
`refuseNext(status, options)` does: `dropNextReply({ method:
"icrc1_transfer" })` loses the transfer's reply while the reads around it
are answered. A request that several drops match uses up the one armed
first.

#### Parameters

##### options?

###### method?

`string`

###### canister?

`string`

###### times?

`number`

#### Returns

`void`

#### Throws

RangeError for a `times` that is not a count of at least 1;
TypeError for options that are not an object, an option that does not
exist, an empty `method`, or a `canister` that is not a canister id.

### refuseNext()

#### Call Signature

> **refuseNext**(`status`, `options`): `void`

Answers the next `times` canister requests that name `method` and are
addressed to `canister` (each one that is given) with an HTTP error
`status` before any canister sees them, and lets every other request
through: `refuseNext(429, { method: "icrc1_transfer" })` throttles the
transfer while the reads around it are answered.

A query and a replicated call of the same method both match. `canister`
is the canister the request names (`aaaaa-aa` for a call to the
management canister), and need not be mocked: a gateway refuses a request
for a canister that does not exist. `times` counts matching requests,
each send of a call the client re-sends included. A request that several
refusals match is refused by the one armed first.

##### Parameters

###### status

`number`

An HTTP error status, from 400 to 599.

###### options

Which requests to refuse, and how many (`times`,
default 1). Options with neither `method` nor `canister` refuse whatever
query or call comes next, as a count does.

###### method?

`string`

###### canister?

`string`

###### times?

`number`

##### Returns

`void`

##### Throws

RangeError for a status that is not an HTTP error status, or a
`times` that is not a count of at least 1; TypeError for an option that
does not exist, an empty `method`, or a `canister` that is not a canister
id.

#### Call Signature

> **refuseNext**(`status`, `times?`): `void`

Answers the next `times` canister requests (a query or a call) with an
HTTP error `status` before any canister sees them, as a gateway that
throttles does: `refuseNext(429)` is what a client is told when it is
rate limited. The status and `read_state` requests an agent makes on its
own are never refused, so the refusal waits for the next query or call,
whatever its method or canister.

##### Parameters

###### status

`number`

An HTTP error status, from 400 to 599.

###### times?

`number`

How many requests to refuse.

##### Returns

`void`

##### Default Value

```ts
1
```

### requests

> `readonly` **requests**: readonly `FakeReplicaRequest`[]

Every request the client sent the fake replica, in order, as the fake saw
it. The same array grows; copy it to keep a moment of it.

An entry has an `endpoint` (`"status"`, `"query"`, `"call"` or
`"read_state"`) and, where they apply:

- `canisterId`: the canister the request was addressed to, as text.
- `effectiveCanisterId`: the canister it was routed by. It differs from
  `canisterId` for a call to the management canister (`aaaaa-aa`), where
  the client takes it from the call's arguments.
- `methodName`: the method a `query` or `call` named.
- `caller`: the principal the request came from, as text, after the fake
  checked its signature. A canister's `ctx.caller` is this.
- `refused`: why the fake answered before any canister saw the request: a
  signature, delegation or target that did not check out, as a replica
  refuses it, or a `refuseNext()` status.
- `dropped`: `true` when `dropNextReply()` lost the reply to it.

## Throws

TypeError for an option that does not exist, or one that cannot be
used.

## Example

```ts
import { createTestClient } from "@ic-reactor/core/testing"
import { actor, type Actor } from "./canisters/icrc1"

const { client, auth, mock, reject } = createTestClient({ identity: 1 })
mock<Actor>(actor, LEDGER, {
  icrc1_transfer: (_arg, { caller }) =>
    caller === BROKE ? reject(4, "no funds") : { tag: "Ok", value: 1n },
})
const ledger = client.canister<Actor>(actor, { id: LEDGER })

await ledger.icrc1_transfer(arg) // 1n, as the identity of seed 1
auth.switchTo(2) // the next call is signed by another principal
```
