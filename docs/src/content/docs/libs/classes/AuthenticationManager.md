---
title: AuthenticationManager
editUrl: false
next: true
prev: true
---

Defined in: [auth/src/authentication-manager.ts:38](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/authentication-manager.ts#L38)

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

Defined in: [auth/src/authentication-manager.ts:54](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/authentication-manager.ts#L54)

#### Parameters

##### \_\_namedParameters

[`AuthenticationManagerParameters`](../interfaces/AuthenticationManagerParameters.md)

#### Returns

`AuthenticationManager`

## Properties

### clientManager

> `readonly` **clientManager**: [`ClientManager`](ClientManager.md)

Defined in: [auth/src/authentication-manager.ts:47](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/authentication-manager.ts#L47)

## Accessors

### authState

#### Get Signature

> **get** **authState**(): [`AuthState`](../interfaces/AuthState.md)

Defined in: [auth/src/authentication-manager.ts:50](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/authentication-manager.ts#L50)

The current authentication state.

##### Returns

[`AuthState`](../interfaces/AuthState.md)

## Methods

### subscribeAuthState()

> **subscribeAuthState**(`callback`): () => `void`

Defined in: [auth/src/authentication-manager.ts:95](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/authentication-manager.ts#L95)

#### Parameters

##### callback

(`state`) => `void`

#### Returns

() => `void`

---

### prepareClient()

> **prepareClient**(`options?`): `Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

Defined in: [auth/src/authentication-manager.ts:102](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/authentication-manager.ts#L102)

Preloads and creates an AuthClient before a user gesture is needed.

#### Parameters

##### options?

[`AuthenticationClientOptions`](../interfaces/AuthenticationClientOptions.md)

#### Returns

`Promise`\<[`AuthClientLike`](../interfaces/AuthClientLike.md) \| `undefined`\>

---

### authenticate()

> **authenticate**(): `Promise`\<`Identity` \| `undefined`\>

Defined in: [auth/src/authentication-manager.ts:113](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/authentication-manager.ts#L113)

#### Returns

`Promise`\<`Identity` \| `undefined`\>

---

### login()

> **login**(`loginOptions?`): `Promise`\<`void`\>

Defined in: [auth/src/authentication-manager.ts:166](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/authentication-manager.ts#L166)

#### Parameters

##### loginOptions?

[`AuthenticationSignInOptions`](../interfaces/AuthenticationSignInOptions.md)

#### Returns

`Promise`\<`void`\>

---

### logout()

> **logout**(`options?`): `Promise`\<`void`\>

Defined in: [auth/src/authentication-manager.ts:227](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/authentication-manager.ts#L227)

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>
