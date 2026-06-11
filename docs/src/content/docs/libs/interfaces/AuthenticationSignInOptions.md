---
title: AuthenticationSignInOptions
editUrl: false
next: true
prev: true
---

Defined in: [auth/src/types.ts:46](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/types.ts#L46)

## Extends

- [`AuthClientSignInOptions`](AuthClientSignInOptions.md).[`AuthenticationClientOptions`](AuthenticationClientOptions.md)

## Properties

### identityProvider?

> `optional` **identityProvider?**: `string` \| `URL`

Defined in: [auth/src/types.ts:36](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/types.ts#L36)

#### Inherited from

[`AuthenticationClientOptions`](AuthenticationClientOptions.md).[`identityProvider`](AuthenticationClientOptions.md#identityprovider)

---

### windowOpenerFeatures?

> `optional` **windowOpenerFeatures?**: `string`

Defined in: [auth/src/types.ts:37](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/types.ts#L37)

#### Inherited from

[`AuthenticationClientOptions`](AuthenticationClientOptions.md).[`windowOpenerFeatures`](AuthenticationClientOptions.md#windowopenerfeatures)

---

### openIdProvider?

> `optional` **openIdProvider?**: [`IdentityAttributeOpenIdProvider`](../type-aliases/IdentityAttributeOpenIdProvider.md)

Defined in: [auth/src/types.ts:38](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/types.ts#L38)

#### Inherited from

[`AuthenticationClientOptions`](AuthenticationClientOptions.md).[`openIdProvider`](AuthenticationClientOptions.md#openidprovider)

---

### maxTimeToLive?

> `optional` **maxTimeToLive?**: `bigint`

Defined in: [auth/src/types.ts:42](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/types.ts#L42)

#### Inherited from

[`AuthClientSignInOptions`](AuthClientSignInOptions.md).[`maxTimeToLive`](AuthClientSignInOptions.md#maxtimetolive)

---

### targets?

> `optional` **targets?**: `Principal`[]

Defined in: [auth/src/types.ts:43](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/types.ts#L43)

#### Inherited from

[`AuthClientSignInOptions`](AuthClientSignInOptions.md).[`targets`](AuthClientSignInOptions.md#targets)

---

### onSuccess?

> `optional` **onSuccess?**: () => `void` \| `Promise`\<`void`\>

Defined in: [auth/src/types.ts:48](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/types.ts#L48)

#### Returns

`void` \| `Promise`\<`void`\>

---

### onError?

> `optional` **onError?**: (`error?`) => `void` \| `Promise`\<`void`\>

Defined in: [auth/src/types.ts:49](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/auth/src/types.ts#L49)

#### Parameters

##### error?

`string`

#### Returns

`void` \| `Promise`\<`void`\>
