---
title: AgentState
editUrl: false
next: true
prev: true
---

Defined in: [types/client.ts:48](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/types/client.ts#L48)

Represents the state of an agent.

## Properties

### isInitialized

> **isInitialized**: `boolean`

Defined in: [types/client.ts:52](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/types/client.ts#L52)

Indicates whether the agent has been initialized.

---

### isInitializing

> **isInitializing**: `boolean`

Defined in: [types/client.ts:57](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/types/client.ts#L57)

Indicates whether the agent is in the process of initializing.

---

### error

> **error**: `Error` \| `undefined`

Defined in: [types/client.ts:62](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/types/client.ts#L62)

Represents an error associated with the agent, if any.

---

### network

> **network**: `string` \| `undefined`

Defined in: [types/client.ts:67](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/types/client.ts#L67)

Represents the network associated with the agent, if any.

---

### isLocalhost

> **isLocalhost**: `boolean`

Defined in: [types/client.ts:72](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/types/client.ts#L72)

Indicates whether the agent is connected to a local network.
