# @ic-reactor/auth-react

React hooks for authentication and signed identity attribute flows from
`@ic-reactor/auth`.

```bash
npm install @ic-reactor/auth-react @ic-reactor/auth @ic-reactor/core react
```

```tsx
import { AuthenticationManager } from "@ic-reactor/auth"
import { createAuthHooks } from "@ic-reactor/auth-react"

const authentication = new AuthenticationManager({ clientManager })
export const { useAuth, useUserPrincipal } = createAuthHooks(authentication)
```
