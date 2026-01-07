---
title: AuthState
editUrl: false
next: true
prev: true
---

Defined in: [types/client.ts:78](https://github.com/B3Pay/ic-reactor/blob/b38e21a4f5fbba372b591197117f8b9d957059d2/packages/core/src/types/client.ts#L78)

Represents the authentication state of an agent.

## Properties

### identity

> **identity**: `Identity` \| `null`

Defined in: [types/client.ts:79](https://github.com/B3Pay/ic-reactor/blob/b38e21a4f5fbba372b591197117f8b9d957059d2/packages/core/src/types/client.ts#L79)

---

### isAuthenticating

> **isAuthenticating**: `boolean`

Defined in: [types/client.ts:84](https://github.com/B3Pay/ic-reactor/blob/b38e21a4f5fbba372b591197117f8b9d957059d2/packages/core/src/types/client.ts#L84)

Indicates whether the authentication process is ongoing.

---

### isAuthenticated

> **isAuthenticated**: `boolean`

Defined in: [types/client.ts:89](https://github.com/B3Pay/ic-reactor/blob/b38e21a4f5fbba372b591197117f8b9d957059d2/packages/core/src/types/client.ts#L89)

Indicates whether the agent is authenticated.

---

### error

> **error**: `Error` \| `undefined`

Defined in: [types/client.ts:94](https://github.com/B3Pay/ic-reactor/blob/b38e21a4f5fbba372b591197117f8b9d957059d2/packages/core/src/types/client.ts#L94)

Represents any error that occurred during authentication.
