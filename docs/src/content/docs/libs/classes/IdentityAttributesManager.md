---
editUrl: false
next: true
prev: true
---

Defined in: auth/src/identity-attributes-manager.ts:22

Requests signed identity attributes through an AuthenticationManager.

This optional feature is separated from normal sign-in/session management
so applications that only need authentication do not carry its workflow in
their primary manager.

## Constructors

### Constructor

> **new IdentityAttributesManager**(`authentication`): `IdentityAttributesManager`

Defined in: auth/src/identity-attributes-manager.ts:23

#### Parameters

##### authentication

[`AuthenticationManager`](AuthenticationManager.md)

#### Returns

`IdentityAttributesManager`

## Properties

### authentication

> `readonly` **authentication**: [`AuthenticationManager`](AuthenticationManager.md)

Defined in: auth/src/identity-attributes-manager.ts:23

## Methods

### request()

> **request**(`__namedParameters`): `Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>

Defined in: auth/src/identity-attributes-manager.ts:25

#### Parameters

##### \_\_namedParameters

[`RequestIdentityAttributesParameters`](../interfaces/RequestIdentityAttributesParameters.md)

#### Returns

`Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>

---

### requestOpenId()

> **requestOpenId**(`__namedParameters`): `Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>

Defined in: auth/src/identity-attributes-manager.ts:88

#### Parameters

##### \_\_namedParameters

[`RequestOpenIdIdentityAttributesParameters`](../interfaces/RequestOpenIdIdentityAttributesParameters.md)

#### Returns

`Promise`\<[`IdentityAttributeResult`](../interfaces/IdentityAttributeResult.md)\>
