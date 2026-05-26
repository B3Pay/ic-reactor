---
editUrl: false
next: true
prev: true
---

Defined in: auth/src/authentication-manager.ts:40

Manages Internet Identity sign-in, session restoration, and authentication
state for a [ClientManager](ClientManager.md).

## Example

```ts
const authentication = new AuthenticationManager({ clientManager })
const identity = await authentication.authenticate()
```

## Constructors

### Constructor

> **new AuthenticationManager**(`__namedParameters`): `AuthenticationManager`

Defined in: auth/src/authentication-manager.ts:62

#### Parameters

##### \_\_namedParameters

[`AuthenticationManagerParameters`](../interfaces/AuthenticationManagerParameters.md)

#### Returns

`AuthenticationManager`

## Properties

### clientManager

> `readonly` **clientManager**: [`ClientManager`](ClientManager.md)

Defined in: auth/src/authentication-manager.ts:54

---

### authState

> **authState**: [`AuthState`](../interfaces/AuthState.md)

Defined in: auth/src/authentication-manager.ts:55

## Methods

### subscribeAuthState()

> **subscribeAuthState**(`callback`): () => `void`

Defined in: auth/src/authentication-manager.ts:101

#### Parameters

##### callback

(`state`) => `void`

#### Returns

() => `void`

---

### prepareClient()

> **prepareClient**(`options?`): `Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

Defined in: auth/src/authentication-manager.ts:113

Preloads and creates an AuthClient before a user gesture is needed.

#### Parameters

##### options?

[`AuthenticationClientOptions`](../interfaces/AuthenticationClientOptions.md)

#### Returns

`Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

---

### authenticate()

> **authenticate**(): `Promise`\<`Identity` \| `undefined`\>

Defined in: auth/src/authentication-manager.ts:124

#### Returns

`Promise`\<`Identity` \| `undefined`\>

---

### login()

> **login**(`loginOptions?`): `Promise`\<`void`\>

Defined in: auth/src/authentication-manager.ts:177

#### Parameters

##### loginOptions?

[`AuthenticationSignInOptions`](../interfaces/AuthenticationSignInOptions.md)

#### Returns

`Promise`\<`void`\>

---

### logout()

> **logout**(`options?`): `Promise`\<`void`\>

Defined in: auth/src/authentication-manager.ts:238

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>
