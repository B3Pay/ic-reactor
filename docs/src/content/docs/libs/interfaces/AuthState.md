---
title: AuthState
editUrl: false
next: true
prev: true
---

Defined in: [types/client.ts:89](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/types/client.ts#L89)

Represents the authentication state of an agent.

## Properties

### identity

> **identity**: `Identity` \| `null`

Defined in: [types/client.ts:90](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/types/client.ts#L90)

***

### isAuthenticating

> **isAuthenticating**: `boolean`

Defined in: [types/client.ts:95](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/types/client.ts#L95)

Indicates whether the authentication process is ongoing.

***

### isAuthenticated

> **isAuthenticated**: `boolean`

Defined in: [types/client.ts:100](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/types/client.ts#L100)

Indicates whether the agent is authenticated.

***

### error

> **error**: `Error` \| `undefined`

Defined in: [types/client.ts:105](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/types/client.ts#L105)

Represents any error that occurred during authentication.
