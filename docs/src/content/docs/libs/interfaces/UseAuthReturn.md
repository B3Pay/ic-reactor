---
title: UseAuthReturn
editUrl: false
next: true
prev: true
---

Defined in: [react/src/hooks/createAuthHooks.ts:8](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/hooks/createAuthHooks.ts#L8)

## Properties

### authenticate

> **authenticate**: () => `Promise`\<`Identity` \| `undefined`\>

Defined in: [react/src/hooks/createAuthHooks.ts:9](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/hooks/createAuthHooks.ts#L9)

#### Returns

`Promise`\<`Identity` \| `undefined`\>

---

### login

> **login**: (`options?`) => `Promise`\<`void`\>

Defined in: [react/src/hooks/createAuthHooks.ts:10](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/hooks/createAuthHooks.ts#L10)

#### Parameters

##### options?

[`AuthenticationSignInOptions`](AuthenticationSignInOptions.md)

#### Returns

`Promise`\<`void`\>

---

### logout

> **logout**: (`options?`) => `Promise`\<`void`\>

Defined in: [react/src/hooks/createAuthHooks.ts:11](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/hooks/createAuthHooks.ts#L11)

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>

---

### isAuthenticated

> **isAuthenticated**: `boolean`

Defined in: [react/src/hooks/createAuthHooks.ts:12](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/hooks/createAuthHooks.ts#L12)

---

### isAuthenticating

> **isAuthenticating**: `boolean`

Defined in: [react/src/hooks/createAuthHooks.ts:13](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/hooks/createAuthHooks.ts#L13)

---

### principal

> **principal**: `Principal` \| `null`

Defined in: [react/src/hooks/createAuthHooks.ts:14](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/hooks/createAuthHooks.ts#L14)

---

### identity

> **identity**: `Identity` \| `null`

Defined in: [react/src/hooks/createAuthHooks.ts:15](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/hooks/createAuthHooks.ts#L15)

---

### error

> **error**: `Error` \| `undefined`

Defined in: [react/src/hooks/createAuthHooks.ts:16](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/hooks/createAuthHooks.ts#L16)
