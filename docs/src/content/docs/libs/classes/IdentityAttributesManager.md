---
title: IdentityAttributesManager
editUrl: false
next: true
prev: true
---

Defined in: [auth/src/identity-attributes-manager.ts:25](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/identity-attributes-manager.ts#L25)

Requests and decodes signed identity attributes for an authenticated
Internet Identity session.

## Example

```ts
const attributes = new IdentityAttributesManager(authentication)
const result = await attributes.request({ keys: ["name"] })
```

## Constructors

### Constructor

> **new IdentityAttributesManager**(`authentication`): `IdentityAttributesManager`

Defined in: [auth/src/identity-attributes-manager.ts:26](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/identity-attributes-manager.ts#L26)

#### Parameters

##### authentication

[`AuthenticationManager`](AuthenticationManager.md)

#### Returns

`IdentityAttributesManager`

## Properties

### authentication

> `readonly` **authentication**: [`AuthenticationManager`](AuthenticationManager.md)

Defined in: [auth/src/identity-attributes-manager.ts:26](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/identity-attributes-manager.ts#L26)

## Methods

### request()

> **request**(`__namedParameters`): `Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>

Defined in: [auth/src/identity-attributes-manager.ts:28](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/identity-attributes-manager.ts#L28)

#### Parameters

##### \_\_namedParameters

[`RequestIdentityAttributesParameters`](../interfaces/RequestIdentityAttributesParameters.md)

#### Returns

`Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>

---

### requestOpenId()

> **requestOpenId**(`__namedParameters`): `Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>

Defined in: [auth/src/identity-attributes-manager.ts:91](https://github.com/B3Pay/ic-reactor/blob/fbfc4241a329c09ad8cb45d17b14b82f0049faf0/packages/auth/src/identity-attributes-manager.ts#L91)

#### Parameters

##### \_\_namedParameters

[`RequestOpenIdIdentityAttributesParameters`](../interfaces/RequestOpenIdIdentityAttributesParameters.md)

#### Returns

`Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>
