# @ic-reactor/auth

Internet Identity support for IC Reactor, kept separate from the agent and
reactor runtime in `@ic-reactor/core`.

```bash
npm install @ic-reactor/auth @ic-reactor/core @icp-sdk/auth @icp-sdk/core
```

```ts
import { ClientManager } from "@ic-reactor/core"
import { AuthenticationManager } from "@ic-reactor/auth"

const clientManager = new ClientManager({ queryClient })
const authentication = new AuthenticationManager({ clientManager })

await authentication.login()
```

Use `IdentityAttributesManager` for signed Internet Identity attribute
requests without expanding `ClientManager`.
