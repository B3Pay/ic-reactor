---
title: ClientManagerParameters
editUrl: false
next: true
prev: true
---

Defined in: [types/client.ts:14](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/client.ts#L14)

Parameters for configuring a ClientManager instance.

## Properties

### queryClient

> **queryClient**: `QueryClient`

Defined in: [types/client.ts:18](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/client.ts#L18)

The TanStack QueryClient used for caching and state management.

---

### agentOptions?

> `optional` **agentOptions**: `HttpAgentOptions`

Defined in: [types/client.ts:22](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/client.ts#L22)

Optional configuration for the underlying HttpAgent.

---

### port?

> `optional` **port**: `number`

Defined in: [types/client.ts:26](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/client.ts#L26)

The port used for the local IC replica (default is 4943).

---

### withLocalEnv?

> `optional` **withLocalEnv**: `boolean`

Defined in: [types/client.ts:30](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/client.ts#L30)

If true, configures the agent for a local environment.

---

### withProcessEnv?

> `optional` **withProcessEnv**: `boolean`

Defined in: [types/client.ts:34](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/client.ts#L34)

If true, auto-configures the agent based on process.env settings.

---

### authClient?

> `optional` **authClient**: `AuthClient`

Defined in: [types/client.ts:42](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/client.ts#L42)

Optional pre-initialized AuthClient instance.
If provided, the manager will use this instance instead of dynamically importing
and creating a new one from `@icp-sdk/auth`.
This is useful for environments where dynamic imports are not supported or
when you want to share an AuthClient instance across multiple managers.
