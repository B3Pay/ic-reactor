---
title: AuthenticationManager
editUrl: false
next: true
prev: true
---

Defined in: [react/src/auth/authentication-manager.ts:41](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/authentication-manager.ts#L41)

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

Defined in: [react/src/auth/authentication-manager.ts:67](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/authentication-manager.ts#L67)

#### Parameters

##### \_\_namedParameters

[`AuthenticationManagerParameters`](../interfaces/AuthenticationManagerParameters.md)

#### Returns

`AuthenticationManager`

## Properties

### clientManager

> `readonly` **clientManager**: [`ClientManager`](ClientManager.md)

Defined in: [react/src/auth/authentication-manager.ts:60](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/authentication-manager.ts#L60)

## Accessors

### authState

#### Get Signature

> **get** **authState**(): [`AuthState`](../interfaces/AuthState.md)

Defined in: [react/src/auth/authentication-manager.ts:63](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/authentication-manager.ts#L63)

The current authentication state.

##### Returns

[`AuthState`](../interfaces/AuthState.md)

## Methods

### subscribeAuthState()

> **subscribeAuthState**(`callback`): () => `void`

Defined in: [react/src/auth/authentication-manager.ts:104](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/authentication-manager.ts#L104)

#### Parameters

##### callback

(`state`) => `void`

#### Returns

() => `void`

---

### prepareClient()

> **prepareClient**(`options?`): `Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

Defined in: [react/src/auth/authentication-manager.ts:116](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/authentication-manager.ts#L116)

Preloads and creates an AuthClient before a user gesture is needed.

#### Parameters

##### options?

[`AuthenticationClientOptions`](../interfaces/AuthenticationClientOptions.md)

#### Returns

`Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

---

### authenticate()

> **authenticate**(): `Promise`\<`Identity` \| `undefined`\>

Defined in: [react/src/auth/authentication-manager.ts:133](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/authentication-manager.ts#L133)

#### Returns

`Promise`\<`Identity` \| `undefined`\>

---

### login()

> **login**(`loginOptions?`): `Promise`\<`void`\>

Defined in: [react/src/auth/authentication-manager.ts:190](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/authentication-manager.ts#L190)

#### Parameters

##### loginOptions?

[`AuthenticationSignInOptions`](../interfaces/AuthenticationSignInOptions.md)

#### Returns

`Promise`\<`void`\>

---

### logout()

> **logout**(`options?`): `Promise`\<`void`\>

Defined in: [react/src/auth/authentication-manager.ts:251](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/authentication-manager.ts#L251)

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>
