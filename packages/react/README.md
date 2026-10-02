# @ic-reactor/react

> **ic-reactor 4 is in development on the `v4` branch.** This package is at a
> `4.0.0-alpha` version that is not published (milestone 1,
> [#790](https://github.com/B3Pay/ic-reactor/issues/790)).

[![npm version](https://img.shields.io/npm/v/@ic-reactor/react.svg)](https://www.npmjs.com/package/@ic-reactor/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The React bindings of ic-reactor 4: three `'use client'` exports over a client
made by [`@ic-reactor/core`](../core/README.md).

| Export            | What it is                                                                     |
| ----------------- | ------------------------------------------------------------------------------ |
| `ReactorProvider` | Owns one client per tree and gives TanStack Query that client's `QueryClient`. |
| `useClient`       | The client of the nearest provider.                                            |
| `useAuth`         | Who calls (`status`, `principal`), with `signIn` and `signOut`.                |

There is no hook that wraps `useQuery` or `useMutation`: read and write
canisters with TanStack Query's own hooks and the options the client builds.
The package never re-exports `@ic-reactor/core`, so every name has one import
path. The guide for both packages ships in core:
`node_modules/@ic-reactor/core/llms.txt`.

## Install

```bash
npm install @ic-reactor/core @ic-reactor/react @tanstack/react-query
```

Peers: `react` 18 or newer, `@tanstack/react-query` 5, and `@ic-reactor/core` at
exactly this package's version (the two are released together).

## Provide a client

`ReactorProvider` takes a factory, not a client, and calls it once for each
mounted provider. `createClient` does no work until the client is used, so the
same line runs in a server render (anonymous, no auth built) and in the browser
(signed in).

```tsx
"use client"

import { createClient } from "@ic-reactor/core"
import { ReactorProvider } from "@ic-reactor/react"
import { AuthClient } from "@icp-sdk/auth/client"
import type { ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ReactorProvider
      client={() =>
        createClient({ network: "ic", auth: () => new AuthClient() })
      }
    >
      {children}
    </ReactorProvider>
  )
}
```

Render it at the root of the part of the app that calls canisters. In a
framework that renders Server Components, keep the factory in a client module
like this one: a function cannot cross from a Server Component into a client
one, so `<Providers>` is what the server layout renders.

## Who is signed in

```tsx
import { useAuth } from "@ic-reactor/react"

export function SessionButton() {
  const { status, principal, signIn, signOut } = useAuth()
  return status === "signed-in" ? (
    <button onClick={() => signOut().catch(console.error)}>
      Sign out {principal}
    </button>
  ) : (
    <button onClick={() => signIn().catch(console.error)}>Sign in</button>
  )
}
```

`status` is `"anonymous"`, `"signed-in"`, `"expired"` or `"signed-in-elsewhere"`,
and `principal` is the principal calls go out as: the anonymous principal
(`2vxsx-fae`) in every state but `"signed-in"`. A component that uses
`useAuth()` renders once for each change of status or principal, and never for
anything else; the object it returns is the same until one changes.

## On a server

- **One client per request.** A server renders each request as a tree of its
  own, so the factory runs once per request, and no cache or caller is shared
  between two users. Never build the client at module scope on a server.
- **Anonymous first render.** `useAuth()` is `anonymous` on a server and on the
  first render of a hydrating page, even when the browser holds a session: the
  server has none, and the HTML has to match. A signed-in browser renders again
  with its session right after hydration. Show the same thing signed out and
  while the session is read, and the page does not flicker into a different
  layout.
- **Nothing runs on a server but the render.** The auth factory is never called,
  nothing reads `window` or `localStorage`, and no effect runs, so no timer or
  listener outlives the request.

## Life of the client

The provider disposes its client when it unmounts: it stops listening to the
auth, disposes it, and clears the `QueryClient`. React's development
double-mount (`StrictMode` unmounts and mounts every component at once) does
not dispose a client in use, because the disposal is scheduled for the next
macrotask and the second mount cancels it.

Only the factory of the first render is used: passing another function on a
later render does not rebuild the client. To replace the client, give the
provider another `key`.

When React shows a hidden `Activity` again after its client was disposed, the
provider builds another one with the same factory. That client starts with an
empty cache: hiding a provider inside an `Activity` drops everything it had
fetched, because React cannot tell a hidden subtree from an unmounted one when
it cleans up. To keep the cache across hiding, render the provider above the
`Activity`.

## 3.x

The released 3.x package, with its hook factories and auth hooks, is documented
at https://ic-reactor.b3pay.net/v3/packages/react. Its source and security fixes
live on the `main` branch.
