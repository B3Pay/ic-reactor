---
title: AuthenticationManager
editUrl: false
next: true
prev: true
---

Defined in: react/src/auth/authentication-manager.ts:39

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

Defined in: react/src/auth/authentication-manager.ts:63

#### Parameters

##### \_\_namedParameters

[`AuthenticationManagerParameters`](../interfaces/AuthenticationManagerParameters.md)

#### Returns

`AuthenticationManager`

## Properties

### clientManager

> `readonly` **clientManager**: [`ClientManager`](ClientManager.md)

Defined in: react/src/auth/authentication-manager.ts:56

## Accessors

### authState

#### Get Signature

> **get** **authState**(): [`AuthState`](../interfaces/AuthState.md)

Defined in: react/src/auth/authentication-manager.ts:59

The current authentication state.

##### Returns

[`AuthState`](../interfaces/AuthState.md)

## Methods

### subscribeAuthState()

> **subscribeAuthState**(`callback`): () => `void`

Defined in: react/src/auth/authentication-manager.ts:100

#### Parameters

##### callback

(`state`) => `void`

#### Returns

() => `void`

---

### prepareClient()

> **prepareClient**(`options?`): `Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

Defined in: react/src/auth/authentication-manager.ts:112

Preloads and creates an AuthClient before a user gesture is needed.

#### Parameters

##### options?

[`AuthenticationClientOptions`](../interfaces/AuthenticationClientOptions.md)

#### Returns

`Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

---

### authenticate()

> **authenticate**(): `Promise`\<`Identity` \| `undefined`\>

Defined in: react/src/auth/authentication-manager.ts:129

#### Returns

`Promise`\<`Identity` \| `undefined`\>

---

### login()

> **login**(`loginOptions?`): `Promise`\<`void`\>

Defined in: react/src/auth/authentication-manager.ts:186

#### Parameters

##### loginOptions?

[`AuthenticationSignInOptions`](../interfaces/AuthenticationSignInOptions.md)

#### Returns

`Promise`\<`void`\>

---

### logout()

> **logout**(`options?`): `Promise`\<`void`\>

Defined in: react/src/auth/authentication-manager.ts:247

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>
