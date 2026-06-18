---
title: createAuthHooks
editUrl: false
next: true
prev: true
---

> **createAuthHooks**(`authentication`): [`CreateAuthHooksReturn`](../interfaces/CreateAuthHooksReturn.md)

Defined in: [react/src/hooks/createAuthHooks.ts:39](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/react/src/hooks/createAuthHooks.ts#L39)

Create authentication hooks for managing user sessions with Internet Identity.

## Parameters

### authentication

[`AuthenticationManager`](../classes/AuthenticationManager.md)

## Returns

[`CreateAuthHooksReturn`](../interfaces/CreateAuthHooksReturn.md)

## Example

```ts
const { useAuth, useUserPrincipal, useAgentState } = createAuthHooks(authentication)

function App() {
  const { login, logout, principal, isAuthenticated } = useAuth()

  return isAuthenticated
    ? <button onClick={logout}>Logout {principal?.toText()}</button>
    : <button onClick={login}>Login with II</button>
}
```
