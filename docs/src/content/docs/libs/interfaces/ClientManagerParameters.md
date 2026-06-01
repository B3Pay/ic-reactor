---
title: ClientManagerParameters
editUrl: false
next: true
prev: true
---

Defined in: [core/src/types/client.ts:13](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L13)

Parameters for configuring a ClientManager instance.

## Properties

### queryClient

> **queryClient**: `QueryClient`

Defined in: [core/src/types/client.ts:17](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L17)

The TanStack QueryClient used for caching and state management.

---

### agentOptions?

> `optional` **agentOptions?**: `HttpAgentOptions`

Defined in: [core/src/types/client.ts:21](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L21)

Optional configuration for the underlying HttpAgent.

---

### port?

> `optional` **port?**: `number`

Defined in: [core/src/types/client.ts:25](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L25)

The port used for the local IC replica (default is 4943).

---

### withLocalEnv?

> `optional` **withLocalEnv?**: `boolean`

Defined in: [core/src/types/client.ts:29](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L29)

If true, configures the agent for a local environment.

---

### withProcessEnv?

> `optional` **withProcessEnv?**: `boolean`

Defined in: [core/src/types/client.ts:33](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L33)

If true, auto-configures the agent based on process.env settings.

---

### withCanisterEnv?

> `optional` **withCanisterEnv?**: `boolean`

Defined in: [core/src/types/client.ts:44](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/client.ts#L44)

**`Experimental`**

**EXPERIMENTAL** - If true, uses the canister environment from `@icp-sdk/core/agent/canister-env`
to automatically configure the agent host and root key based on the `ic_env` cookie.

⚠️ This feature is experimental and may cause issues with update calls on localhost development.
Use with caution and only when you need automatic environment detection from the IC SDK.

#### Default

```ts
false
```
