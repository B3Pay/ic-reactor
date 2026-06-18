---
title: UseIdentityAttributesReturn
editUrl: false
next: true
prev: true
---

Defined in: [react/src/auth/createIdentityAttributeHooks.ts:9](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/createIdentityAttributeHooks.ts#L9)

## Properties

### requestAttributes

> **requestAttributes**: (`params`) => `Promise`\<[`IdentityAttributeResult`](IdentityAttributeResult.md)\>

Defined in: [react/src/auth/createIdentityAttributeHooks.ts:10](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/createIdentityAttributeHooks.ts#L10)

#### Parameters

##### params

[`RequestIdentityAttributesParameters`](RequestIdentityAttributesParameters.md)

#### Returns

`Promise`\<[`IdentityAttributeResult`](IdentityAttributeResult.md)\>

---

### requestOpenIdAttributes

> **requestOpenIdAttributes**: (`params`) => `Promise`\<[`IdentityAttributeResult`](IdentityAttributeResult.md)\>

Defined in: [react/src/auth/createIdentityAttributeHooks.ts:13](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/createIdentityAttributeHooks.ts#L13)

#### Parameters

##### params

[`RequestOpenIdIdentityAttributesParameters`](RequestOpenIdIdentityAttributesParameters.md)

#### Returns

`Promise`\<[`IdentityAttributeResult`](IdentityAttributeResult.md)\>

---

### attributes

> **attributes**: [`IdentityAttributeResult`](IdentityAttributeResult.md) \| `null`

Defined in: [react/src/auth/createIdentityAttributeHooks.ts:16](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/createIdentityAttributeHooks.ts#L16)

---

### isRequestingAttributes

> **isRequestingAttributes**: `boolean`

Defined in: [react/src/auth/createIdentityAttributeHooks.ts:17](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/createIdentityAttributeHooks.ts#L17)

---

### attributeError

> **attributeError**: `Error` \| `null`

Defined in: [react/src/auth/createIdentityAttributeHooks.ts:18](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/createIdentityAttributeHooks.ts#L18)

---

### clearAttributes

> **clearAttributes**: () => `void`

Defined in: [react/src/auth/createIdentityAttributeHooks.ts:19](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/auth/createIdentityAttributeHooks.ts#L19)

#### Returns

`void`
