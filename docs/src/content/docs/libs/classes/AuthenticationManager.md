---
title: AuthenticationManager
editUrl: false
next: true
prev: true
---

Defined in: [auth/src/authentication-manager.ts:37](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/authentication-manager.ts#L37)

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

Defined in: [auth/src/authentication-manager.ts:52](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/authentication-manager.ts#L52)

#### Parameters

##### \_\_namedParameters

[`AuthenticationManagerParameters`](../interfaces/AuthenticationManagerParameters.md)

#### Returns

`AuthenticationManager`

## Properties

### clientManager

> `readonly` **clientManager**: [`ClientManager`](ClientManager.md)

Defined in: [auth/src/authentication-manager.ts:45](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/authentication-manager.ts#L45)

## Accessors

### authState

#### Get Signature

> **get** **authState**(): [`AuthState`](../interfaces/AuthState.md)

Defined in: [auth/src/authentication-manager.ts:48](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/authentication-manager.ts#L48)

The current authentication state.

##### Returns

[`AuthState`](../interfaces/AuthState.md)

## Methods

### subscribeAuthState()

> **subscribeAuthState**(`callback`): () => `void`

Defined in: [auth/src/authentication-manager.ts:91](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/authentication-manager.ts#L91)

#### Parameters

##### callback

(`state`) => `void`

#### Returns

() => `void`

---

### prepareClient()

> **prepareClient**(`options?`): `Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

Defined in: [auth/src/authentication-manager.ts:98](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/authentication-manager.ts#L98)

Preloads and creates an AuthClient before a user gesture is needed.

#### Parameters

##### options?

[`AuthenticationClientOptions`](../interfaces/AuthenticationClientOptions.md)

#### Returns

`Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

---

### authenticate()

> **authenticate**(): `Promise`\<`Identity` \| `undefined`\>

Defined in: [auth/src/authentication-manager.ts:115](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/authentication-manager.ts#L115)

#### Returns

`Promise`\<`Identity` \| `undefined`\>

---

### login()

> **login**(`loginOptions?`): `Promise`\<`void`\>

Defined in: [auth/src/authentication-manager.ts:172](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/authentication-manager.ts#L172)

#### Parameters

##### loginOptions?

[`AuthenticationSignInOptions`](../interfaces/AuthenticationSignInOptions.md)

#### Returns

`Promise`\<`void`\>

---

### logout()

> **logout**(`options?`): `Promise`\<`void`\>

Defined in: [auth/src/authentication-manager.ts:233](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/authentication-manager.ts#L233)

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>
