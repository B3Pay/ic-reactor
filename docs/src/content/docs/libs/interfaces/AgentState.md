---
title: AgentState
editUrl: false
next: true
prev: true
---

Defined in: [types/client.ts:59](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/client.ts#L59)

Represents the state of an agent.

## Properties

### isInitialized

> **isInitialized**: `boolean`

Defined in: [types/client.ts:63](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/client.ts#L63)

Indicates whether the agent has been initialized.

---

### isInitializing

> **isInitializing**: `boolean`

Defined in: [types/client.ts:68](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/client.ts#L68)

Indicates whether the agent is in the process of initializing.

---

### error

> **error**: `Error` \| `undefined`

Defined in: [types/client.ts:73](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/client.ts#L73)

Represents an error associated with the agent, if any.

---

### network

> **network**: `string` \| `undefined`

Defined in: [types/client.ts:78](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/client.ts#L78)

Represents the network associated with the agent, if any.

---

### isLocalhost

> **isLocalhost**: `boolean`

Defined in: [types/client.ts:83](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/client.ts#L83)

Indicates whether the agent is connected to a local network.
