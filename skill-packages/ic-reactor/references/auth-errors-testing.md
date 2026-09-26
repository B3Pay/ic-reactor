# Sign-In, Errors and Testing

## Internet Identity sign-in

Install `@icp-sdk/auth@^10` (v8 also works; v7 and v9 do not). A
`defineReactor` / `defineDisplayReactor` result already holds `useAuth`,
`useAgentState`, `useUserPrincipal`, `useIdentityAttributes`,
`authentication` and `identityAttributes`.

```tsx
import type { ReactNode } from "react"
import { useAuth } from "./reactor"

export function RequireSignIn({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAuthenticating, login, principal } = useAuth()
  // true until the stored session has been restored (or failed to), and in
  // every server render: without this check a reload shows the sign-in button
  // to a user who is signed in
  if (isAuthenticating) return <p>Checking session…</p>
  if (!isAuthenticated)
    return <button onClick={() => void login()}>Sign in</button>
  return (
    <>
      <p>Signed in as {principal?.toText()}</p>
      {children}
    </>
  )
}
```

- `useAuth()` returns `login`, `logout`, `authenticate`, `isAuthenticated`,
  `isAuthenticating`, `principal`, `identity` and `error`, and restores a
  stored session when it mounts. Outside React, `authentication.authenticate()`
  restores it. `clientManager.initialize()` restores no session, and calls do
  not need it first.
- A sign-in, sign-out or account switch cancels in-flight fetches of every
  canister on the `ClientManager`, drops their inactive cache entries and
  refetches mounted queries as the new principal. Do not clear the cache or
  reload the page yourself.

With a manual setup, build the manager on the app's `ClientManager`:

```ts
import {
  AuthenticationManager,
  IdentityAttributesManager,
  createAuthHooks,
  createIdentityAttributeHooks,
  hexToUint8Array,
} from "@ic-reactor/react"
import { backend, clientManager } from "./manual"

export const authentication = new AuthenticationManager({ clientManager })
export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(authentication)

export const identityAttributes = new IdentityAttributesManager(authentication)
export const { useIdentityAttributes } =
  createIdentityAttributeHooks(identityAttributes)

// In a click handler: pass the nonce as a callback so the Internet Identity
// window opens within the user gesture. A DisplayReactor returns a blob as hex.
export const requestEmail = () =>
  identityAttributes.request({
    keys: ["email"],
    nonce: async () =>
      hexToUint8Array(
        await backend.callMethod({ functionName: "register_begin" })
      ),
  })
```

A manager built per mount (not at module scope, and not by
`createReactorProvider`, which disposes its own) is released in the cleanup
of whatever built it: `useEffect(() => () => authentication.dispose(), [authentication])`.
`dispose()` does not sign out.

## Errors

| Error             | Cause                                                       | Handle with                                                      |
| ----------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `CanisterError`   | the canister returned `Err`                                 | `onCanisterError` on mutations, `isCanisterError(e)` elsewhere   |
| `CallError`       | network, agent, certificate, a trap, a validator that threw | `onError`, `isCallError(e)`                                      |
| `ValidationError` | a `DisplayReactor` validator refused the arguments          | `isValidationError(e)`, `mapValidationErrors(e)` for form fields |

```ts
import {
  isCallError,
  isCanisterError,
  isValidationError,
} from "@ic-reactor/react"
import { backend } from "./reactor"

export async function rename(name: string) {
  try {
    return await backend.callMethod({
      functionName: "update_profile",
      args: [{ name }],
    })
  } catch (error) {
    if (isCanisterError(error)) {
      // The canister's Err value is error.err; its variant name is error.code
      return `Refused: ${error.code}`
    }
    if (isValidationError(error)) return `Invalid: ${error.message}`
    if (isCallError(error)) return `Network or agent failure: ${error.message}`
    throw error
  }
}
```

`CanisterError` carries the error value on `.err`, not `.detail`, `.data` or
`.message`. The guards also recognise errors from another copy of the
package, so prefer them to `instanceof`.

A hook's `error` is typed `ReactorErrorOf<typeof reactor, "method">`, whose
`CanisterError` holds the method's `Err` type. A caught value is `unknown`,
and so is `.err` after `isCanisterError`; type the value first:

```ts
import {
  formatTokenAmount,
  isCanisterError,
  type ReactorErrorOf,
} from "@ic-reactor/react"
import { ledger } from "./ledger"

type TransferFailure = ReactorErrorOf<typeof ledger, "icrc1_transfer">

export function shortfall(caught: unknown, decimals: number) {
  const error = caught as TransferFailure
  // `ledger` is a raw Reactor, so the variant is { InsufficientFunds: ... };
  // on a DisplayReactor, compare error.err._type instead
  if (isCanisterError(error) && "InsufficientFunds" in error.err) {
    return formatTokenAmount(error.err.InsufficientFunds.balance, decimals)
  }
  return undefined
}
```

## Retries

```ts
import { createMutation, reactorUpdateRetry } from "@ic-reactor/react"
import { backend } from "./reactor"

export const renameProfile = createMutation(backend, {
  functionName: "update_profile",
  // Resends only a SysTransient rejection, which proves the call never ran.
  // A number here would run a state-changing call again after a timeout.
  retry: reactorUpdateRetry,
})
```

- `reactorRetry` (predicate `isRetryableReactorError`) is the query retry of
  the `QueryClient` `defineReactor` builds; give a `QueryClient` you build
  `defaultOptions: { queries: { retry: reactorRetry } }`. It never retries a
  `CanisterError`, a `ValidationError`, an encode/decode failure or an HTTP
  4xx other than 408 and 429.
- A query of an update method without its own `retry` retries only
  `SysTransient`.
- A `mutations.retry` default on the `QueryClient` also reaches
  `createMutation().execute()` and `useActorMethod` update calls; make it
  `reactorUpdateRetry` if you set one.
- Both return `false` where there is no `window`. For query retries in Node,
  pass `retry: (count, error) => count < 3 && isRetryableReactorError(error)`.

## Testing against the fake replica

Use `@ic-reactor/react/testing` (or `@ic-reactor/core/testing` without
React). It signs with `@noble/curves`, which `@icp-sdk/core` installs; add it
as a devDependency if your package manager does not let the kit resolve it.

```ts
import { afterEach, beforeEach, expect, it } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { ClientManager, Reactor, isCanisterError } from "@ic-reactor/react"
import {
  createTestCanister,
  installFakeReplica,
  type FakeReplica,
} from "@ic-reactor/react/testing"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

let replica: FakeReplica
let backend: Reactor<_SERVICE>

beforeEach(() => {
  // Install the fake before any ClientManager or agent is built
  replica = installFakeReplica({
    canisters: {
      [canisterId]: createTestCanister<_SERVICE>(idlFactory, {
        // Handlers get the decoded args and { caller } and return raw Candid
        greet: ([name]) => `Hello, ${name}!`,
        update_profile: () => ({ Err: { NotFound: null } }),
      }),
    },
  })
  backend = new Reactor<_SERVICE>({
    clientManager: new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: replica.host },
    }),
    name: "backend",
    canisterId,
    idlFactory,
  })
})
afterEach(() => replica.restore())

it("greets", async () => {
  await expect(
    backend.fetchQuery({ functionName: "greet", args: ["Ada"] })
  ).resolves.toBe("Hello, Ada!")
})

it("turns an Err into a CanisterError", async () => {
  const error = await backend
    .callMethod({ functionName: "update_profile", args: [{ name: "" }] })
    .catch((e: unknown) => e)
  expect(isCanisterError(error) && error.code).toBe("NotFound")
})
```

A component that imports a module-scope `defineReactor(...)` builds its agent
on import, so install the fake first and import the component after it:

```tsx
import { afterAll, afterEach, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  createTestCanister,
  installFakeReplica,
} from "@ic-reactor/react/testing"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

const replica = installFakeReplica({
  canisters: {
    [canisterId]: createTestCanister<_SERVICE>(idlFactory, {
      get_profile: ([id]) => ({ name: `user ${id}`, likes: 3n }),
    }),
  },
})
afterAll(() => replica.restore())

// Imported after the fake is installed, because they build the agent
const { ProfileCard } = await import("./ProfileCard")
const { backendApp } = await import("./reactor")

afterEach(() => backendApp.queryClient.clear())

it("renders the profile", async () => {
  render(<ProfileCard userId="1" />)
  expect(await screen.findByText("user 1: 3 likes")).toBeTruthy()
})
```

With the Vite plugin or the CLI, the canister's entry
(`./declarations/backend`) builds its reactor and imports `src/clients.ts`,
which builds the `ClientManager`. Import the declarations from its
`declarations/` folder, which builds nothing, and the entry after the fake:

```tsx
import { afterAll, afterEach, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import {
  createTestCanister,
  installFakeReplica,
} from "@ic-reactor/react/testing"
import {
  idlFactory,
  type _SERVICE,
} from "./declarations/backend/declarations/backend"

const replica = installFakeReplica({
  canisters: {
    // The canisterId the generator wrote into index.generated.ts
    "rrkah-fqaaa-aaaaa-aaaaq-cai": createTestCanister<_SERVICE>(idlFactory, {
      get_post: ([id]) => ({ id, title: "Hello", likes: 3n }),
    }),
  },
})
afterAll(() => replica.restore())

const { Post } = await import("./Post") // uses getPostQuery from the entry
const { queryClient } = await import("./clients")

afterEach(() => queryClient.clear())

it("renders the post", async () => {
  render(<Post id="1" />)
  expect(await screen.findByText("3 likes")).toBeTruthy()
})
```

Vitest runs `vite.config.ts` unless a `vitest.config.ts` replaces it, so the
Vite plugin generates again in mode `test`. When it takes `canisterId` from
`loadEnv`, set that variable for the test mode (`CANISTER_ID_BACKEND=...` in
`.env.test`); otherwise the regenerated `index.generated.ts` has no id and
importing it throws `canisterId is required`.

- With no `host` on either side, the app's `ClientManager` and the fake both
  use the page origin (jsdom, happy-dom). If the app passes a local
  `agentOptions.host`, pass the same `host` to `installFakeReplica`. An agent
  on a mainnet host (`https://ic0.app`, `https://icp-api.io`) checks
  certificates against mainnet's root key, so against the fake every call
  fails with a certificate verification `CallError`: in the test, build that
  `ClientManager` with
  `agentOptions: { host: replica.host, rootKey: replica.rootKey }`.
- A handler returns `{ Err: ... }` to produce a `CanisterError` and throws to
  produce the `CallError` of a trap.
- Test a signed-in user with a test identity, not `login()`:
  `clientManager.updateAgent(Ed25519KeyIdentity.generate())`, with
  `Ed25519KeyIdentity` from `@icp-sdk/core/identity`. Handlers then see its
  principal as `caller`.
- Never stub a reactor with `{ ... } as unknown as Reactor`, and never
  hard-code query keys in tests.

Docs: https://ic-reactor.b3pay.net/v3/guides/authentication.md,
https://ic-reactor.b3pay.net/v3/guides/error-handling.md,
https://ic-reactor.b3pay.net/v3/guides/testing.md,
https://ic-reactor.b3pay.net/v3/reference/testing.md
