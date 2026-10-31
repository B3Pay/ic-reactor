---
title: useClient
editUrl: false
next: true
prev: true
---

> **useClient**(): [`Client`](/docs/ic-reactor/libs/interfaces/client/)

Defined in: [react/src/index.tsx:582](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/react/src/index.tsx#L582)

The client of the nearest [ReactorProvider](/docs/ic-reactor/libs/functions/reactorprovider/): the one object that
builds canister handles and query options, and that signs users in and out.

What it returns is a view of the client for the caller the render shows:
one object per caller, a new one after a sign-in, a switch of account or a
sign-out, and the same one on every render while the caller stays. Its
`queryKey`, `queryOptions`, `caller()` and `authState()` are that caller's
(`authState()` is the client's own while that caller is the live one, an
expired session included), and its `mutationOptions` send only as that
caller: a write pressed before a switch reached the render is refused
(`kind` `"cancelled"`, `code` `"caller_changed"`, `mayHaveExecuted:
false`) and sends nothing, so a handler needs no check of its own. Their
`mutationKey` ends with that caller. A handler that awaits `signIn()` and
then calls `mutate` presses with the last committed render's options, and
is refused while the signed-in render has not committed (one that suspends
on the user's data): let the next render press, or make a direct call. A
canister's direct calls, `func` and `resendOf`'s `send` sign as the caller
current when they run. Everything else (canisters, `signIn`, `signOut`,
`subscribe`, `dispose`, the `QueryClient`) is the client's own. It is
never the provider's client object: to tell two clients apart, compare
their `queryClient`.

Call it in the body of each component that builds keys or options, on
every render, and build them from what it returns there, never from a
client held at module scope: they are built for the caller this render
shows. List it in the dependencies of whatever is built from it
(`useMemo(() => client.queryOptions(...), [client])`, an effect or a
callback, as `react-hooks/exhaustive-deps` asks), and React Compiler does
the same: since the object changes with the caller, what is memoized on it
is built again for the new one. Do not keep what it returns past the
render: a view never moves on. Kept anywhere else (`useState(client)`,
`useRef(client)`, a `useMemo` or `useCallback` with `[]`, a module
variable), it stays the view of the caller it was taken for: the component
shows that caller's data, a read it starts while someone else is signed in
is cancelled, and a write through its `mutationOptions` is refused. Nothing
warns about it. A nested [ReactorProvider](/docs/ic-reactor/libs/functions/reactorprovider/) given it
(`client={() => client}`) holds the client the view was made over.
It follows the client's caller with `useSyncExternalStore`, so a
component that calls it renders again when the caller changes (a sign-in, a
switch of account, a sign-out) and never otherwise: a change of status that
leaves the caller as it is (a session that expired, or one signed in
elsewhere, both call as the anonymous principal) renders nothing, and
returns the same object.

On a server, and while a page hydrates, the caller is the anonymous one, as
for [useAuth](/docs/ic-reactor/libs/functions/useauth/). In a browser that holds a session, the hydrating render
gets the anonymous caller's view, so the page finds what the server
prefetched and dehydrated and matches its HTML. Right after hydrating,
React renders the component again with the user's view: a read with none
of the user's data yet shows its loading state, and a `useSuspenseQuery`
read its boundary's fallback, until that data arrives. A client built with
`identity` keeps its caller for good and is always returned as it is.

Three consequences of that move on a signed-in reload:

- A Suspense boundary that is still dehydrated below a component that
  renders with the caller (this hook or [useAuth](/docs/ic-reactor/libs/functions/useauth/)), because its lazy
  code is still loading or its streamed HTML has not arrived, is rendered
  on the client when that component moves on: it shows its fallback
  instead of the server's HTML, and React 18 reports a recoverable error.
  Its data is still the user's. A `useAuth()` component also moves on in a
  tab whose session expired or is signed in elsewhere. Render such a boundary where no component
  that renders with the caller sits above it, or pass it in as `children`,
  which a component's own update does not render again.
- A read the hydrating render built may still run once (TanStack Query
  refetches stale data on mount, and an effect may fetch with the view's
  options). It is cancelled before anything is sent. A key that holds data
  keeps it as it was, and a fetch of it resolves with that data. A key with
  none fails (`kind` `"cancelled"`, `code` `"caller_changed"`) until the
  anonymous caller is current again: the hydrating render's own reads never
  show that, but a listener of
  `client.queryClient.getQueryCache().subscribe()` (the client takes no
  `QueryCache` of yours), an effect that awaits the fetch and, for a
  `useSuspenseQuery` read the server rendered without dehydrating its
  data, React's `onRecoverableError` (as the reported error's `cause` on
  React 19) see it, so ignore `kind` `"cancelled"` there.
- Put a Suspense boundary above every component that reads with
  `useSuspenseQuery`, on React 18 and 19 alike. The move is a synchronous
  update, which such a read suspends until the user's data arrives. With a
  boundary above, the boundary shows its fallback, then the user's data,
  and the rest of the page responds meanwhile. With none, React 18 refuses
  the update ("A component suspended while responding to synchronous
  input") and unmounts the root, so a signed-in reload renders nothing.
  React 19 keeps the server's HTML on screen, but until the user's data
  arrives, however long the read and its retries take, a click or any other
  update outside a transition commits nothing, and neither does a
  transition that renders the reading component again.

## Returns

[`Client`](/docs/ic-reactor/libs/interfaces/client/)

## Throws

Error outside a `ReactorProvider`, naming it.
