---
title: AgentState
editUrl: false
next: true
prev: true
---

Defined in: [types/client.ts:139](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L139)

Represents the state of an agent.

## Properties

### isInitialized

> **isInitialized**: `boolean`

Defined in: [types/client.ts:143](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L143)

Indicates whether the agent has been initialized.

---

### isInitializing

> **isInitializing**: `boolean`

Defined in: [types/client.ts:148](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L148)

Indicates whether the agent is in the process of initializing.

---

### error

> **error**: `Error` \| `undefined`

Defined in: [types/client.ts:153](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L153)

Represents an error associated with the agent, if any.

---

### network

> **network**: `string` \| `undefined`

Defined in: [types/client.ts:158](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L158)

Represents the network associated with the agent, if any.

---

### isLocalhost

> **isLocalhost**: `boolean`

Defined in: [types/client.ts:163](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L163)

Indicates whether the agent is connected to a local network.
