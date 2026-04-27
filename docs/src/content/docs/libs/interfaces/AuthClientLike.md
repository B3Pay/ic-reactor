---
title: AuthClientLike
editUrl: false
next: true
prev: true
---

Defined in: [types/client.ts:84](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L84)

## Methods

### getIdentity()

> **getIdentity**(): `Identity` \| `Promise`\<`Identity`\>

Defined in: [types/client.ts:85](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L85)

#### Returns

`Identity` \| `Promise`\<`Identity`\>

---

### isAuthenticated()

> **isAuthenticated**(): `boolean` \| `Promise`\<`boolean`\>

Defined in: [types/client.ts:86](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L86)

#### Returns

`boolean` \| `Promise`\<`boolean`\>

---

### signIn()

> **signIn**(`options?`): `Promise`\<`Identity`\>

Defined in: [types/client.ts:87](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L87)

#### Parameters

##### options?

[`AuthClientSignInOptions`](AuthClientSignInOptions.md)

#### Returns

`Promise`\<`Identity`\>

---

### logout()

> **logout**(`options?`): `Promise`\<`void`\>

Defined in: [types/client.ts:88](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L88)

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>

---

### requestAttributes()

> **requestAttributes**(`params`): `Promise`\<[`SignedIdentityAttributes`](SignedIdentityAttributes.md)\>

Defined in: [types/client.ts:89](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L89)

#### Parameters

##### params

[`IdentityAttributeRequest`](IdentityAttributeRequest.md)

#### Returns

`Promise`\<[`SignedIdentityAttributes`](SignedIdentityAttributes.md)\>
