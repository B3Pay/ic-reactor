---
title: AuthClientLike
editUrl: false
next: true
prev: true
---

Defined in: [react/src/auth/types.ts:74](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/types.ts#L74)

## Methods

### getIdentity()

> **getIdentity**(): `Identity` \| `Promise`\<`Identity`\>

Defined in: [react/src/auth/types.ts:75](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/types.ts#L75)

#### Returns

`Identity` \| `Promise`\<`Identity`\>

---

### isAuthenticated()

> **isAuthenticated**(): `boolean` \| `Promise`\<`boolean`\>

Defined in: [react/src/auth/types.ts:76](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/types.ts#L76)

#### Returns

`boolean` \| `Promise`\<`boolean`\>

---

### signIn()

> **signIn**(`options?`): `Promise`\<`Identity`\>

Defined in: [react/src/auth/types.ts:77](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/types.ts#L77)

#### Parameters

##### options?

[`AuthClientSignInOptions`](AuthClientSignInOptions.md)

#### Returns

`Promise`\<`Identity`\>

---

### signOut()

> **signOut**(`options?`): `Promise`\<`void`\>

Defined in: [react/src/auth/types.ts:78](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/types.ts#L78)

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>

---

### requestAttributes()

> **requestAttributes**(`params`): `Promise`\<[`SignedIdentityAttributes`](SignedIdentityAttributes.md)\>

Defined in: [react/src/auth/types.ts:79](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/types.ts#L79)

#### Parameters

##### params

[`IdentityAttributeRequest`](IdentityAttributeRequest.md)

#### Returns

`Promise`\<[`SignedIdentityAttributes`](SignedIdentityAttributes.md)\>
