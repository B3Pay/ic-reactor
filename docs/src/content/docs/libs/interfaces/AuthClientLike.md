---
editUrl: false
next: true
prev: true
---

Defined in: auth/src/types.ts:74

## Methods

### getIdentity()

> **getIdentity**(): `Identity` \| `Promise`\<`Identity`\>

Defined in: auth/src/types.ts:75

#### Returns

`Identity` \| `Promise`\<`Identity`\>

---

### isAuthenticated()

> **isAuthenticated**(): `boolean` \| `Promise`\<`boolean`\>

Defined in: auth/src/types.ts:76

#### Returns

`boolean` \| `Promise`\<`boolean`\>

---

### signIn()

> **signIn**(`options?`): `Promise`\<`Identity`\>

Defined in: auth/src/types.ts:77

#### Parameters

##### options?

[`AuthClientSignInOptions`](AuthClientSignInOptions.md)

#### Returns

`Promise`\<`Identity`\>

---

### signOut()

> **signOut**(`options?`): `Promise`\<`void`\>

Defined in: auth/src/types.ts:78

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>

---

### requestAttributes()

> **requestAttributes**(`params`): `Promise`\<[`SignedIdentityAttributes`](SignedIdentityAttributes.md)\>

Defined in: auth/src/types.ts:79

#### Parameters

##### params

[`IdentityAttributeRequest`](IdentityAttributeRequest.md)

#### Returns

`Promise`\<[`SignedIdentityAttributes`](SignedIdentityAttributes.md)\>
