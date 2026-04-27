---
title: ClientManagerSignInOptions
editUrl: false
next: true
prev: true
---

Defined in: [types/client.ts:56](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L56)

## Extends

- [`AuthClientSignInOptions`](AuthClientSignInOptions.md).[`ClientManagerAuthClientOptions`](ClientManagerAuthClientOptions.md)

## Properties

### identityProvider?

> `optional` **identityProvider?**: `string` \| `URL`

Defined in: [types/client.ts:46](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L46)

#### Inherited from

[`ClientManagerAuthClientOptions`](ClientManagerAuthClientOptions.md).[`identityProvider`](ClientManagerAuthClientOptions.md#identityprovider)

---

### windowOpenerFeatures?

> `optional` **windowOpenerFeatures?**: `string`

Defined in: [types/client.ts:47](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L47)

#### Inherited from

[`ClientManagerAuthClientOptions`](ClientManagerAuthClientOptions.md).[`windowOpenerFeatures`](ClientManagerAuthClientOptions.md#windowopenerfeatures)

---

### openIdProvider?

> `optional` **openIdProvider?**: [`IdentityAttributeOpenIdProvider`](../type-aliases/IdentityAttributeOpenIdProvider.md)

Defined in: [types/client.ts:48](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L48)

#### Inherited from

[`ClientManagerAuthClientOptions`](ClientManagerAuthClientOptions.md).[`openIdProvider`](ClientManagerAuthClientOptions.md#openidprovider)

---

### maxTimeToLive?

> `optional` **maxTimeToLive?**: `bigint`

Defined in: [types/client.ts:52](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L52)

#### Inherited from

[`AuthClientSignInOptions`](AuthClientSignInOptions.md).[`maxTimeToLive`](AuthClientSignInOptions.md#maxtimetolive)

---

### targets?

> `optional` **targets?**: `Principal`[]

Defined in: [types/client.ts:53](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L53)

#### Inherited from

[`AuthClientSignInOptions`](AuthClientSignInOptions.md).[`targets`](AuthClientSignInOptions.md#targets)

---

### onSuccess?

> `optional` **onSuccess?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/client.ts:58](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L58)

#### Returns

`void` \| `Promise`\<`void`\>

---

### onError?

> `optional` **onError?**: (`error?`) => `void` \| `Promise`\<`void`\>

Defined in: [types/client.ts:59](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L59)

#### Parameters

##### error?

`string`

#### Returns

`void` \| `Promise`\<`void`\>
