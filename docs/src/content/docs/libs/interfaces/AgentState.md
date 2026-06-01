---
title: AgentState
editUrl: false
next: true
prev: true
---

Defined in: [core/src/types/client.ts:50](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L50)

Represents the state of an agent.

## Properties

### isInitialized

> **isInitialized**: `boolean`

Defined in: [core/src/types/client.ts:54](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L54)

Indicates whether the agent has been initialized.

---

### isInitializing

> **isInitializing**: `boolean`

Defined in: [core/src/types/client.ts:59](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L59)

Indicates whether the agent is in the process of initializing.

---

### error

> **error**: `Error` \| `undefined`

Defined in: [core/src/types/client.ts:64](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L64)

Represents an error associated with the agent, if any.

---

### network

> **network**: `string` \| `undefined`

Defined in: [core/src/types/client.ts:69](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L69)

Represents the network associated with the agent, if any.

---

### isLocalhost

> **isLocalhost**: `boolean`

Defined in: [core/src/types/client.ts:74](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L74)

Indicates whether the agent is connected to a local network.
