---
title: AuthState
editUrl: false
next: true
prev: true
---

Defined in: [types/client.ts:169](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L169)

Represents the authentication state of an agent.

## Properties

### identity

> **identity**: `Identity` \| `null`

Defined in: [types/client.ts:170](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L170)

---

### isAuthenticating

> **isAuthenticating**: `boolean`

Defined in: [types/client.ts:175](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L175)

Indicates whether the authentication process is ongoing.

---

### isAuthenticated

> **isAuthenticated**: `boolean`

Defined in: [types/client.ts:180](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L180)

Indicates whether the agent is authenticated.

---

### error

> **error**: `Error` \| `undefined`

Defined in: [types/client.ts:185](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L185)

Represents any error that occurred during authentication.
