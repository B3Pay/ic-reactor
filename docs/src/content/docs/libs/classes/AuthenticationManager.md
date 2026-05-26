---
editUrl: false
next: true
prev: true
---

Defined in: auth/src/authentication-manager.ts:36

Owns AuthClient lifecycle and authentication-specific flows.

ClientManager remains responsible for agent and query state; authentication
is opt-in by constructing this manager around a ClientManager instance.

## Constructors

### Constructor

> **new AuthenticationManager**(`__namedParameters`): `AuthenticationManager`

Defined in: auth/src/authentication-manager.ts:58

#### Parameters

##### \_\_namedParameters

[`AuthenticationManagerParameters`](../interfaces/AuthenticationManagerParameters.md)

#### Returns

`AuthenticationManager`

## Properties

### clientManager

> `readonly` **clientManager**: [`ClientManager`](ClientManager.md)

Defined in: auth/src/authentication-manager.ts:50

---

### authState

> **authState**: [`AuthState`](../interfaces/AuthState.md)

Defined in: auth/src/authentication-manager.ts:51

## Methods

### subscribeAuthState()

> **subscribeAuthState**(`callback`): () => `void`

Defined in: auth/src/authentication-manager.ts:97

#### Parameters

##### callback

(`state`) => `void`

#### Returns

() => `void`

---

### prepareClient()

> **prepareClient**(`options?`): `Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

Defined in: auth/src/authentication-manager.ts:109

Preloads and creates an AuthClient before a user gesture is needed.

#### Parameters

##### options?

[`AuthenticationClientOptions`](../interfaces/AuthenticationClientOptions.md)

#### Returns

`Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

---

### authenticate()

> **authenticate**(): `Promise`\<`Identity` \| `undefined`\>

Defined in: auth/src/authentication-manager.ts:120

#### Returns

`Promise`\<`Identity` \| `undefined`\>

---

### login()

> **login**(`loginOptions?`): `Promise`\<`void`\>

Defined in: auth/src/authentication-manager.ts:173

#### Parameters

##### loginOptions?

[`AuthenticationSignInOptions`](../interfaces/AuthenticationSignInOptions.md)

#### Returns

`Promise`\<`void`\>

---

### logout()

> **logout**(`options?`): `Promise`\<`void`\>

Defined in: auth/src/authentication-manager.ts:234

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>
