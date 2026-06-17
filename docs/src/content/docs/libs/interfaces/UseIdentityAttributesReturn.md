---
title: UseIdentityAttributesReturn
editUrl: false
next: true
prev: true
---

Defined in: react/src/auth/createIdentityAttributeHooks.ts:9

## Properties

### requestAttributes

> **requestAttributes**: (`params`) => `Promise`\<[`IdentityAttributeResult`](IdentityAttributeResult.md)\>

Defined in: react/src/auth/createIdentityAttributeHooks.ts:10

#### Parameters

##### params

[`RequestIdentityAttributesParameters`](RequestIdentityAttributesParameters.md)

#### Returns

`Promise`\<[`IdentityAttributeResult`](IdentityAttributeResult.md)\>

---

### requestOpenIdAttributes

> **requestOpenIdAttributes**: (`params`) => `Promise`\<[`IdentityAttributeResult`](IdentityAttributeResult.md)\>

Defined in: react/src/auth/createIdentityAttributeHooks.ts:13

#### Parameters

##### params

[`RequestOpenIdIdentityAttributesParameters`](RequestOpenIdIdentityAttributesParameters.md)

#### Returns

`Promise`\<[`IdentityAttributeResult`](IdentityAttributeResult.md)\>

---

### attributes

> **attributes**: [`IdentityAttributeResult`](IdentityAttributeResult.md) \| `null`

Defined in: react/src/auth/createIdentityAttributeHooks.ts:16

---

### isRequestingAttributes

> **isRequestingAttributes**: `boolean`

Defined in: react/src/auth/createIdentityAttributeHooks.ts:17

---

### attributeError

> **attributeError**: `Error` \| `null`

Defined in: react/src/auth/createIdentityAttributeHooks.ts:18

---

### clearAttributes

> **clearAttributes**: () => `void`

Defined in: react/src/auth/createIdentityAttributeHooks.ts:19

#### Returns

`void`
