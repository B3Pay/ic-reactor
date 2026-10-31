---
title: AuthLike
editUrl: false
next: true
prev: true
---

Defined in: [core/src/client.ts:101](https://github.com/B3Pay/ic-reactor/blob/c885bf6c431f40503ba80497a667379a3a255c56/packages/core/src/client.ts#L101)

A sign-in the client can own: what `@icp-sdk/auth` 10's `AuthClient` and the
`auth` of `createTestClient()` from `@ic-reactor/core/testing` both are, with
no adapter.

The client reads `getStatus()` and `getPrincipal()` synchronously to decide
who calls, asks `getIdentity()` for the identity to sign with only when it
builds or checks an agent for a signed-in principal, and re-reads both after
every `subscribe()` notification. `signIn()` and `signOut()` are forwarded
from [Client.signIn](/docs/ic-reactor/libs/interfaces/client/#signin) and [Client.signOut](/docs/ic-reactor/libs/interfaces/client/#signout), and `dispose()`, when
present, is called from [Client.dispose](/docs/ic-reactor/libs/interfaces/client/#dispose): the client owns the auth its
factory built.

Another sign-in source that hands over an `Identity` (a delegation, such
as a hand-rolled session gives, or a local key) fits by implementing these
six methods, and `dispose()` if it holds anything. A wallet that signs each call itself (ICRC-25 and
ICRC-49: OISY, Plug, NFID accounts) gives no `Identity` and does not fit:
the Auth guide shows writes through such a wallet beside the client. A
source's `getIdentity()` should return the same object until the identity
really changes: the client builds a new agent for every new identity object
it is handed, and reads a new object for the same principal as a renewal.

## Methods

### getPrincipal()

> **getPrincipal**(): \{ `toText`: `string`; \} \| `undefined`

Defined in: [core/src/client.ts:103](https://github.com/B3Pay/ic-reactor/blob/c885bf6c431f40503ba80497a667379a3a255c56/packages/core/src/client.ts#L103)

Who calls are accepted as, or `undefined` when nobody can act.

#### Returns

\{ `toText`: `string`; \} \| `undefined`

***

### getStatus()

> **getStatus**(): `object`

Defined in: [core/src/client.ts:112](https://github.com/B3Pay/ic-reactor/blob/c885bf6c431f40503ba80497a667379a3a255c56/packages/core/src/client.ts#L112)

Who is signed in. Only `"signed-in"` makes the client call as
[AuthLike.getPrincipal](#getprincipal); every other state calls anonymously. The
four named states are `@icp-sdk/auth` 10's; any other string, such as a
state a later `@icp-sdk/auth` adds, is accepted and reads as
`"anonymous"` in [AuthState](/docs/ic-reactor/libs/interfaces/authstate/), so an upgrade of the auth library
does not stop an app compiling.

#### Returns

##### state

> `readonly` **state**: `string` & `object` \| `"signed-in"` \| `"signed-in-elsewhere"` \| `"expired"` \| `"signed-out"`

##### expiresAtMs?

> `readonly` `optional` **expiresAtMs?**: `number`

When the session ends, in milliseconds since the epoch (`Date.now()`'s
scale), as `AuthClient` 10 reports it. While the status is
`"signed-in"` or `"signed-in-elsewhere"`, the client sets a timer for it
and tells its listeners when the session ends: an auth whose status
turns `"expired"` by the clock, as `AuthClient`'s does, need not notify
for it. It is [AuthState.expiresAt](/docs/ic-reactor/libs/interfaces/authstate/#expiresat) while signed in.

***

### getIdentity()

> **getIdentity**(): `Promise`\<`Identity`\>

Defined in: [core/src/client.ts:130](https://github.com/B3Pay/ic-reactor/blob/c885bf6c431f40503ba80497a667379a3a255c56/packages/core/src/client.ts#L130)

The identity to sign calls with while signed in.

#### Returns

`Promise`\<`Identity`\>

***

### subscribe()

> **subscribe**(`listener`): () => `void`

Defined in: [core/src/client.ts:132](https://github.com/B3Pay/ic-reactor/blob/c885bf6c431f40503ba80497a667379a3a255c56/packages/core/src/client.ts#L132)

Calls `listener` after each change of who is signed in. Returns a function that stops listening.

#### Parameters

##### listener

() => `void`

#### Returns

() => `void`

***

### signIn()

> **signIn**(`options?`): `Promise`\<`unknown`\>

Defined in: [core/src/client.ts:133](https://github.com/B3Pay/ic-reactor/blob/c885bf6c431f40503ba80497a667379a3a255c56/packages/core/src/client.ts#L133)

#### Parameters

##### options?

`unknown`

#### Returns

`Promise`\<`unknown`\>

***

### signOut()

> **signOut**(`options?`): `Promise`\<`unknown`\>

Defined in: [core/src/client.ts:134](https://github.com/B3Pay/ic-reactor/blob/c885bf6c431f40503ba80497a667379a3a255c56/packages/core/src/client.ts#L134)

#### Parameters

##### options?

`unknown`

#### Returns

`Promise`\<`unknown`\>

***

### dispose()?

> `optional` **dispose**(): `void`

Defined in: [core/src/client.ts:136](https://github.com/B3Pay/ic-reactor/blob/c885bf6c431f40503ba80497a667379a3a255c56/packages/core/src/client.ts#L136)

Releases what the auth holds. Called once, from [Client.dispose](/docs/ic-reactor/libs/interfaces/client/#dispose).

#### Returns

`void`
