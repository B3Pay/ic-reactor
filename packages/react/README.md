# @ic-reactor/react

> **ic-reactor 4 is in development on the `v4` branch.** This package is at a
> `4.0.0-alpha` version that is not published (milestone 1,
> [#790](https://github.com/B3Pay/ic-reactor/issues/790)).

[![npm version](https://img.shields.io/npm/v/@ic-reactor/react.svg)](https://www.npmjs.com/package/@ic-reactor/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The React bindings of ic-reactor 4: three `'use client'` exports over a client
made by [`@ic-reactor/core`](../core/README.md).

| Export            | What it is                                                               |
| ----------------- | ------------------------------------------------------------------------ |
| `ReactorProvider` | Gives a tree one client, and TanStack Query that client's `QueryClient`. |
| `useClient`       | The client of the nearest provider.                                      |
| `useAuth`         | Who calls (`status`, `principal`), with `signIn` and `signOut`.          |

There is no hook that wraps `useQuery` or `useMutation`: read and write
canisters with TanStack Query's own hooks and the options the client builds.
The package never re-exports `@ic-reactor/core`, so every name has one import
path.

## Install

```bash
npm install @ic-reactor/core @ic-reactor/react @tanstack/react-query
```

Peers: `react` 18 or newer, `@tanstack/react-query` 5, and `@ic-reactor/core` at
exactly this package's version (the two are released together).

## Provide a client

`ReactorProvider` takes a factory, not a client, and calls it once for each
mounted provider. When it unmounts, it disposes the client only if that factory
call created it. Both ways of writing the factory are fine:

- **The provider owns the client.** A factory that creates it,
  `client={() => createClient({ ... })}`, gives each mounted provider a client
  of its own, and the provider disposes it when it unmounts. Use this in an
  app that renders on a server: the factory runs once per request.
- **The app owns the client.** A client created at module scope, one per tab
  and used outside React too, is handed over as `client={() => client}`. The
  provider borrows it and never disposes it, however many times it mounts and
  unmounts: the app decides when it ends.

`createClient` does no work until the client is used, so the same line runs in
a server render (anonymous, no auth built) and in the browser (signed in).

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

A client the app owns, in a browser-only app:

```tsx
"use client"

import { createClient } from "@ic-reactor/core"
import { ReactorProvider } from "@ic-reactor/react"
import { AuthClient } from "@icp-sdk/auth/client"
import type { ReactNode } from "react"

// One client for this tab, also used outside React.
export const client = createClient({
  network: "ic",
  auth: () => new AuthClient(),
})

export function Providers({ children }: { children: ReactNode }) {
  return <ReactorProvider client={() => client}>{children}</ReactorProvider>
}
```

Who owns a client follows from when it was created, not from where the factory
is written. A getter that creates the shared client on its first call
(`client ??= createClient(...)`) makes the first provider that calls it the
owner, and that provider disposes it when it unmounts. It can lose the client
even before that: when React throws away the render that created it (a
Suspense boundary above the provider that suspends), the client stays queued
for disposal at garbage collection until the next render gets it back, so a
collection while the fallback shows disposes the client the page then mounts
(see [Life of the client](#life-of-the-client)). Create a shared client
eagerly, as above. In development, a provider whose factory hands back a client
that an earlier factory call created and no provider has committed yet, as a
lazily shared getter does, logs a warning that names the fix (under
`StrictMode`, which calls the factory twice, on the first render); and a
provider that is given a client which is already disposed logs an error.

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
  own, so a factory that creates the client runs once per request, and no
  cache or caller is shared between two users. Never build the client at
  module scope on a server: a module-scope client is for a browser-only app.
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

The provider disposes a client its factory created when it unmounts: the
client stops listening to the auth, disposes it, and clears the `QueryClient`.
React's development double-mount (`StrictMode` unmounts and mounts every
component at once) does not dispose a client in use, because the disposal is
scheduled for the next macrotask and the second mount cancels it. A client the
app owns is never disposed by a provider.

React runs no cleanup for a render it throws away before committing it, such
as a provider's first render below a Suspense boundary that suspends. A client
the factory built for such a render, whose auth a `useAuth()` below may
already have built, is disposed once that render's state is garbage collected
(through a `FinalizationRegistry`, in a browser): later than an unmount would,
but its auth and listeners do not outlive it. A client the factory returns
again, or that a mounted provider runs on, is never disposed this way, whoever
created it.

Only the factory of the first render is used: passing another function on a
later render does not rebuild the client. To replace the client, give the
provider another `key`.

When React shows a hidden `Activity` again after the client the provider owns
was disposed, the provider builds another one with the same factory. That
client starts with an empty cache: hiding a provider inside an `Activity` drops
everything it had fetched, because React cannot tell a hidden subtree from an
unmounted one when it cleans up. To keep the cache across hiding, render the
provider above the `Activity`, or give it a client the app owns.

## 3.x

The released 3.x package, with its hook factories and auth hooks, is documented
at https://ic-reactor.b3pay.net/v3/packages/react. Its source and security fixes
live on the `main` branch.
