---
title: UseAuthReturn
editUrl: false
next: true
prev: true
---

Defined in: react/src/hooks/createAuthHooks.ts:8

## Properties

### authenticate

> **authenticate**: () => `Promise`\<`Identity` \| `undefined`\>

Defined in: react/src/hooks/createAuthHooks.ts:9

#### Returns

`Promise`\<`Identity` \| `undefined`\>

---

### login

> **login**: (`options?`) => `Promise`\<`void`\>

Defined in: react/src/hooks/createAuthHooks.ts:10

#### Parameters

##### options?

[`AuthenticationSignInOptions`](AuthenticationSignInOptions.md)

#### Returns

`Promise`\<`void`\>

---

### logout

> **logout**: (`options?`) => `Promise`\<`void`\>

Defined in: react/src/hooks/createAuthHooks.ts:11

#### Parameters

##### options?

###### returnTo?

`string`

#### Returns

`Promise`\<`void`\>

---

### isAuthenticated

> **isAuthenticated**: `boolean`

Defined in: react/src/hooks/createAuthHooks.ts:12

---

### isAuthenticating

> **isAuthenticating**: `boolean`

Defined in: react/src/hooks/createAuthHooks.ts:13

---

### principal

> **principal**: `Principal` \| `null`

Defined in: react/src/hooks/createAuthHooks.ts:14

---

### identity

> **identity**: `Identity` \| `null`

Defined in: react/src/hooks/createAuthHooks.ts:15

---

### error

> **error**: `Error` \| `undefined`

Defined in: react/src/hooks/createAuthHooks.ts:16
