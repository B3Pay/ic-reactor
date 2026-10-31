---
title: useAuth
editUrl: false
next: true
prev: true
---

> **useAuth**(): [`AuthState`](/docs/ic-reactor/libs/interfaces/authstate/) & `object`

Defined in: [react/src/index.tsx:650](https://github.com/B3Pay/ic-reactor/blob/189aba57cfa0e99738cd0bfc7e05c28c8ff94a26/packages/react/src/index.tsx#L650)

Who calls, and how to change it: the client's [AuthState](/docs/ic-reactor/libs/interfaces/authstate/) (`status`,
`principal` and, while signed in, `expiresAt`) with `signIn` and `signOut`
forwarded to the client.

It follows the client with `useSyncExternalStore`, so a component renders
again once per change of status, principal or `expiresAt` and never
otherwise (a renewed delegation, or a parent that renders, does not). A
session that ends by the clock renders it again with `"expired"` when its
`expiresAt` passes, with no user activity needed.

`"signed-in"` may be a read-only session: Internet Identity can scope one to
queries, and the network refuses its updates. Nothing tells the two apart
yet. The object it returns is
the same until the state changes, so it is safe in a dependency array or
as a prop of a memoized child.

On a server, and while a page hydrates, the state is `anonymous`: the
server has no session, and rendering the browser's would not match the
server's HTML. A browser whose state is another one (signed in, or a session
that expired or is signed in elsewhere) renders the component again with its
own state right after hydration; an anonymous one does not, and keeps the
object. A component that reads `status` before then should show the same
thing signed out and while the session is read. Whenever it moves on after
hydrating (a signed-in reload, or a session that expired or is signed in
elsewhere), it renders a Suspense boundary still dehydrated below it on the
client, as for [useClient](/docs/ic-reactor/libs/functions/useclient/).

`signIn` and `signOut` reject like [Client.signIn](/docs/ic-reactor/libs/interfaces/client/#signin) and
[Client.signOut](/docs/ic-reactor/libs/interfaces/client/#signout): on a client built with `identity`, which has no
sign-in, and on a server.

## Returns

## Throws

Error outside a [ReactorProvider](/docs/ic-reactor/libs/functions/reactorprovider/).
