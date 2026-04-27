---
title: ClientManagerParameters
editUrl: false
next: true
prev: true
---

Defined in: [types/client.ts:94](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L94)

## Properties

### queryClient

> **queryClient**: `QueryClient`

Defined in: [types/client.ts:98](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L98)

The TanStack QueryClient used for caching and state management.

---

### agentOptions?

> `optional` **agentOptions?**: `HttpAgentOptions`

Defined in: [types/client.ts:102](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L102)

Optional configuration for the underlying HttpAgent.

---

### port?

> `optional` **port?**: `number`

Defined in: [types/client.ts:106](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L106)

The port used for the local IC replica (default is 4943).

---

### withLocalEnv?

> `optional` **withLocalEnv?**: `boolean`

Defined in: [types/client.ts:110](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L110)

If true, configures the agent for a local environment.

---

### withProcessEnv?

> `optional` **withProcessEnv?**: `boolean`

Defined in: [types/client.ts:114](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L114)

If true, auto-configures the agent based on process.env settings.

---

### authClient?

> `optional` **authClient?**: [`AuthClientLike`](AuthClientLike.md)

Defined in: [types/client.ts:122](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L122)

Optional pre-initialized AuthClient instance.
If provided, the manager will use this instance instead of dynamically importing
and creating a new one from `@icp-sdk/auth`.
This is useful for environments where dynamic imports are not supported or
when you want to share an AuthClient instance across multiple managers.

---

### withCanisterEnv?

> `optional` **withCanisterEnv?**: `boolean`

Defined in: [types/client.ts:133](https://github.com/B3Pay/ic-reactor/blob/0479ee2d6b5b870cd63ac54f273d8bc9820ed7bc/packages/core/src/types/client.ts#L133)

**`Experimental`**

**EXPERIMENTAL** - If true, uses the canister environment from `@icp-sdk/core/agent/canister-env`
to automatically configure the agent host and root key based on the `ic_env` cookie.

⚠️ This feature is experimental and may cause issues with update calls on localhost development.
Use with caution and only when you need automatic environment detection from the IC SDK.

#### Default

```ts
false
```
