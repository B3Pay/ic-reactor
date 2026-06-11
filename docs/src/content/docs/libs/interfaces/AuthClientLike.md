---
title: AuthClientLike
editUrl: false
next: true
prev: true
---

Defined in: [auth/src/types.ts:74](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/types.ts#L74)

## Methods

### getIdentity()

> **getIdentity**(): `Identity` \| `Promise`\<`Identity`\>

Defined in: [auth/src/types.ts:75](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/types.ts#L75)

#### Returns

`Identity` \| `Promise`\<`Identity`\>

---

### isAuthenticated()

> **isAuthenticated**(): `boolean` \| `Promise`\<`boolean`\>

Defined in: [auth/src/types.ts:76](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/types.ts#L76)

#### Returns

`boolean` \| `Promise`\<`boolean`\>

---

### signIn()

> **signIn**(`options?`): `Promise`\<`Identity`\>

Defined in: [auth/src/types.ts:77](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/types.ts#L77)

#### Parameters

##### options?

[`AuthClientSignInOptions`](AuthClientSignInOptions.md)

#### Returns

`Promise`\<`Identity`\>

---

### signOut()

> **signOut**(`options?`): `Promise`\<`void`\>

Defined in: [auth/src/types.ts:78](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/types.ts#L78)

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>

---

### requestAttributes()

> **requestAttributes**(`params`): `Promise`\<[`SignedIdentityAttributes`](SignedIdentityAttributes.md)\>

Defined in: [auth/src/types.ts:79](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/types.ts#L79)

#### Parameters

##### params

[`IdentityAttributeRequest`](IdentityAttributeRequest.md)

#### Returns

`Promise`\<[`SignedIdentityAttributes`](SignedIdentityAttributes.md)\>
