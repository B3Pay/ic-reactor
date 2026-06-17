---
title: AuthenticationSignInOptions
editUrl: false
next: true
prev: true
---

Defined in: react/src/auth/types.ts:46

## Extends

- [`AuthClientSignInOptions`](AuthClientSignInOptions.md).[`AuthenticationClientOptions`](AuthenticationClientOptions.md)

## Properties

### identityProvider?

> `optional` **identityProvider?**: `string` \| `URL`

Defined in: react/src/auth/types.ts:36

#### Inherited from

[`AuthenticationClientOptions`](AuthenticationClientOptions.md).[`identityProvider`](AuthenticationClientOptions.md#identityprovider)

---

### windowOpenerFeatures?

> `optional` **windowOpenerFeatures?**: `string`

Defined in: react/src/auth/types.ts:37

#### Inherited from

[`AuthenticationClientOptions`](AuthenticationClientOptions.md).[`windowOpenerFeatures`](AuthenticationClientOptions.md#windowopenerfeatures)

---

### openIdProvider?

> `optional` **openIdProvider?**: [`IdentityAttributeOpenIdProvider`](../type-aliases/IdentityAttributeOpenIdProvider.md)

Defined in: react/src/auth/types.ts:38

#### Inherited from

[`AuthenticationClientOptions`](AuthenticationClientOptions.md).[`openIdProvider`](AuthenticationClientOptions.md#openidprovider)

---

### maxTimeToLive?

> `optional` **maxTimeToLive?**: `bigint`

Defined in: react/src/auth/types.ts:42

#### Inherited from

[`AuthClientSignInOptions`](AuthClientSignInOptions.md).[`maxTimeToLive`](AuthClientSignInOptions.md#maxtimetolive)

---

### targets?

> `optional` **targets?**: `Principal`[]

Defined in: react/src/auth/types.ts:43

#### Inherited from

[`AuthClientSignInOptions`](AuthClientSignInOptions.md).[`targets`](AuthClientSignInOptions.md#targets)

---

### onSuccess?

> `optional` **onSuccess?**: () => `void` \| `Promise`\<`void`\>

Defined in: react/src/auth/types.ts:48

#### Returns

`void` \| `Promise`\<`void`\>

---

### onError?

> `optional` **onError?**: (`error?`) => `void` \| `Promise`\<`void`\>

Defined in: react/src/auth/types.ts:49

#### Parameters

##### error?

`string`

#### Returns

`void` \| `Promise`\<`void`\>
