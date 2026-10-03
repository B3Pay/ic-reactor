# @ic-reactor/react

> **ic-reactor 4 is a prerelease.** `4.0.0-beta.1` is published under npm's
> `beta` dist-tag, and `latest` stays 3.x until 4.0 GA (milestone 1,
> [#790](https://github.com/B3Pay/ic-reactor/issues/790)).

[![npm version](https://img.shields.io/npm/v/@ic-reactor/react.svg)](https://www.npmjs.com/package/@ic-reactor/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

The React bindings of ic-reactor 4: three `'use client'` exports over a client
made by [`@ic-reactor/core`](../core/README.md).

| Export            | What it is                                                               |
| ----------------- | ------------------------------------------------------------------------ |
| `ReactorProvider` | Gives a tree one client, and TanStack Query that client's `QueryClient`. |
| `useClient`       | The client of the nearest provider, for the caller this render shows.    |
| `useAuth`         | Who calls (`status`, `principal`), with `signIn` and `signOut`.          |

There is no hook that wraps `useQuery` or `useMutation`: read and write
canisters with TanStack Query's own hooks and the options the client builds.
The package never re-exports `@ic-reactor/core`, so every name has one import
path. The guide for both packages ships in core:
`node_modules/@ic-reactor/core/llms.txt`.

## Install

```bash
npm install @ic-reactor/core@beta @ic-reactor/react@beta @tanstack/react-query
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

## Keys follow the caller a render shows

Query keys carry the caller. Call `useClient()` in the body of each component
that builds keys or read options, on every render, and build them from what it
returns there, never from a client held at module scope. Do not keep what it
returns past the render: while a page hydrates it is a view for the anonymous
caller, and a view never moves on. An effect or a callback that uses it closes
over the value of its own render and lists it in its dependencies, as the
`react-hooks/exhaustive-deps` lint rule asks, so that it runs again with the
client once the page has hydrated. Kept from the hydrating render anywhere
else (`useState(client)`, `useRef(client)`, a `useMemo` or `useCallback` with
`[]`, a module variable), it stays that view: the component shows the
anonymous caller's data, a read it starts while the user is signed in is
cancelled (`caller_changed`), and a write through it still signs as the live
caller. Nothing warns about it. A nested `ReactorProvider` given it holds the
client the view was made over.

```tsx
import { useClient } from "@ic-reactor/react"
import { useQuery } from "@tanstack/react-query"
import { actor, type Actor } from "./generated/icrc1"

export function Fee({ id }: { id: string }) {
  const client = useClient()
  const ledger = client.canister<Actor>(actor, { id })
  const fee = useQuery(client.queryOptions(ledger, "icrc1_fee"))
  return <span>{fee.data?.toString() ?? "…"}</span>
}
```

`useClient()` follows the client's caller, so a component that calls it renders
again on a sign-in, a switch of account and a sign-out, and builds the new
caller's keys; a change of status that leaves the caller as it is (a session
that expired, or one signed in elsewhere, both call anonymously) renders
nothing. It returns the provider's client object itself, except while a page
hydrates in a browser that holds a session (below). A client built with
`identity` keeps its caller for good and is always returned as it is.

## On a server

- **One client per request.** A server renders each request as a tree of its
  own, so a factory that creates the client runs once per request, and no
  cache or caller is shared between two users. Never build the client at
  module scope on a server: a module-scope client is for a browser-only app.
- **Anonymous while hydrating.** `useAuth()` is `anonymous` on a server and
  while a page hydrates, even when the browser holds a session: the server has
  none, and the HTML has to match. `useClient()` builds keys for that same
  anonymous caller there: in a browser that holds a session (an `AuthClient`
  reads a stored one synchronously), the hydrating render gets a view of the
  client whose `queryKey`, `queryOptions`, `caller()` and `authState()` are
  the anonymous caller's, so the page finds what the server prefetched and
  dehydrated, matches its HTML, and sends nothing. Canisters, writes,
  `signIn`, `signOut` and the `QueryClient` are the client's own, and a write
  signs as the caller current when it runs. Right after hydrating, React
  renders each component that calls `useClient()` or `useAuth()` again with
  the session, and each read loads the user's keys once: until the user's data
  arrives, a read shows its loading state, and a `useSuspenseQuery` read its
  boundary's fallback. A tab whose caller
  is anonymous anyway (no session, or one that expired or is signed in
  elsewhere) renders no `useClient()` component again, and no `useAuth()`
  component either unless its status differs. Show the same thing signed out
  and while the session is read, and the page does not flicker into a
  different layout.
- **Nothing runs on a server but the render.** The auth factory is never called,
  nothing reads `window` or `localStorage`, and no effect runs, so no timer or
  listener outlives the request.

### What a signed-in reload costs

Three consequences of that move to the session are accepted, and tested:

- **A Suspense boundary still dehydrated below a component that renders with
  the caller is rendered on the client.** When a component that calls
  `useClient()` or `useAuth()` moves on to the session, the update reaches the
  boundaries it renders. A boundary that has not hydrated yet, because its
  lazy code is still loading or its streamed HTML has not arrived, is then
  rendered on the client: it shows its fallback instead of
  the server's HTML until its content is ready, and React 18 reports a
  recoverable error. Its data is still the user's, and nothing is sent as
  anyone else. A `useAuth()` component moves on, and costs the same, in a tab
  whose session expired or is signed in elsewhere too. To keep the server's HTML, render such a boundary where no
  component that renders with the caller sits above it (a `useAuth()` header
  beside it is fine), or pass it in as `children`: a component's own update
  does not render its `children` prop again.
- **A read the hydrating render built may run once and be cancelled.**
  TanStack Query refetches stale data on mount, and an effect may fetch with
  the hydrating render's options. Such a read is for the anonymous caller
  while the user is current, so it is cancelled before anything is sent. A
  key that holds data (the server's) keeps it as it was, and a fetch of it
  resolves with that data. A key with none fails, with `kind` `"cancelled"`
  and `code` `"caller_changed"`, until the anonymous caller is current again.
  The hydrating render's own reads never show that error, but a `QueryCache`
  `onError`, an effect that awaits the fetch and, for a `useSuspenseQuery`
  read the server rendered without dehydrating its data, React's
  `onRecoverableError` (as the reported error's `cause` on React 19) see it:
  ignore `kind` `"cancelled"` there.
- **A `useSuspenseQuery` read needs a Suspense boundary above it, on React 18
  and 19 alike.** The move to the session is a synchronous update, and a
  `useSuspenseQuery` read with none of the user's data yet suspends it. With a
  boundary above the read, the boundary shows its fallback until the user's
  data arrives, then the data, and the rest of the page responds meanwhile.
  With none, React 18 refuses the update ("A component suspended while
  responding to synchronous input") and unmounts the root: a signed-in reload
  renders nothing. React 19 keeps the server's HTML on screen, but until the
  user's data arrives, however long the read and its retries take, a click or
  any other update outside a transition commits nothing, and neither does a
  transition that renders the reading component again. React expects a
  boundary above any component that suspends anyway: put one there.

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
