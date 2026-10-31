---
title: ReactorProvider
editUrl: false
next: true
prev: true
---

> **ReactorProvider**(`__namedParameters`): `ReactElement`

Defined in: [react/src/index.tsx:417](https://github.com/B3Pay/ic-reactor/blob/ce557f08e58ca542badaab65172d569c0ec0c62a/packages/react/src/index.tsx#L417)

Gives a tree one client: it gets it from `client` once, on the first
render, makes it available to [useClient](/docs/ic-reactor/libs/functions/useclient/) and [useAuth](/docs/ic-reactor/libs/functions/useauth/), renders
TanStack Query's `QueryClientProvider` around the children with the
client's `QueryClient`, and, if its factory created the client, disposes it
when it unmounts.

An app that already uses TanStack Query runs its own queries on that same
`QueryClient` (one per tree): an error that is not a `ReactorError` is
retried there as TanStack Query retries it, and a write invalidates its
reads on the `QueryClient` it ran on as well, so a `QueryClientProvider` of
the app's nested inside still sees them refresh.

Put it at the root of the part of the app that calls canisters, in a
client module (the examples below). On a server it renders inside the
request, so a factory that creates the client runs once per request and no
cache or caller is shared between two users, which a client at module scope
would be.

Who disposes the client depends on when it was created, not on where the
factory is written. A client the factory call creates belongs to the
provider. A client created before the call, such as one at module scope that
code outside React uses too, is borrowed: the provider never disposes it,
however many times it mounts and unmounts, and the app ends it with
`client.dispose()` if it ever needs to. A factory that creates the shared
client lazily on its first call (`() => (client ??= createClient(...))`)
hands that first provider ownership, and the provider disposes it on
unmount. It can also lose the client before any unmount: when React throws
away the render that created it (see below), the client stays registered
for disposal at collection until the next render gets it back from the
factory, so a garbage collection while the fallback shows disposes the
client the retry then mounts. Create a shared client eagerly instead. In
development, a provider whose factory hands back a client that an earlier
factory call created and no provider has committed yet, as a lazily shared
factory does, logs a warning (under `StrictMode`, on its first render), and
a provider that is given a borrowed client which is already disposed logs an
error.

Disposal is safe in React's development double-mount (`StrictMode` mounts,
unmounts and mounts every component again at once): the cleanup only
schedules the disposal for the next macrotask, and the second mount cancels
it, so a client in use is never disposed. An unmount that is not followed
by a mount disposes an owned client exactly once.

React runs no cleanup for a render it throws away before committing it: the
first render of a provider below a Suspense boundary that suspends, or the
`useState` initializer call that `StrictMode` drops in development. An owned
client built for such a render, whose auth a child's [useAuth](/docs/ic-reactor/libs/functions/useauth/) may
already have built, is disposed once that render's state is garbage
collected, through a `FinalizationRegistry`. That is later than an unmount
would dispose it, at a moment no code chooses, but it is disposed, auth and
listeners with it. A client that the factory returns again, or that a
provider commits, is taken off the registry, whoever owns it. A runtime
without `FinalizationRegistry` never disposes such a client, and a server
never registers one: it builds no auth there, and the rest of the request
still uses it.

React also runs the effects of a subtree again when it shows a hidden
`Activity` once more, and that can be long after they were cleaned up. If an
owned client was disposed meanwhile, the provider builds another from the
same factory, because a disposed client cannot call, sign in or cache any
more. The cost is that hiding a provider inside an `Activity` drops its
cache: disposing clears the `QueryClient`, and the client built on the next
show starts empty. React cannot tell a hidden subtree from an unmounted one
in the cleanup, so there is no way to keep it. To keep a cache across
hiding, render the provider above the `Activity`, not inside it, or give it
a borrowed client, which is never disposed.

## Parameters

### \_\_namedParameters

[`ReactorProviderProps`](/docs/ic-reactor/libs/interfaces/reactorproviderprops/)

## Returns

`ReactElement`

## Examples

A client per provider, owned and disposed by it (on a server, one per
request):
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
        createClient({ network: "ic", auth: (network) => new AuthClient(network) })
      }
    >
      {children}
    </ReactorProvider>
  )
}
```

One client per tab, created at module scope and used outside React too.
The provider borrows it and never disposes it (browser-only: on a server a
module-scope client is shared by every request):
```tsx
"use client"

import { createClient } from "@ic-reactor/core"
import { ReactorProvider } from "@ic-reactor/react"
import { AuthClient } from "@icp-sdk/auth/client"
import type { ReactNode } from "react"

export const client = createClient({
  network: "ic",
  auth: (network) => new AuthClient(network),
})

export function Providers({ children }: { children: ReactNode }) {
  return <ReactorProvider client={() => client}>{children}</ReactorProvider>
}
```
