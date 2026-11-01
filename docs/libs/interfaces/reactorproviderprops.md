---
title: ReactorProviderProps
editUrl: false
next: true
prev: true
---

Defined in: [react/src/index.tsx:281](https://github.com/B3Pay/ic-reactor/blob/7c822a725a135ee579b83982997d6233fd39e3e7/packages/react/src/index.tsx#L281)

Props of [ReactorProvider](/docs/ic-reactor/libs/functions/reactorprovider/).

## Properties

### client

> `readonly` **client**: () => [`Client`](/docs/ic-reactor/libs/interfaces/client/)

Defined in: [react/src/index.tsx:298](https://github.com/B3Pay/ic-reactor/blob/7c822a725a135ee579b83982997d6233fd39e3e7/packages/react/src/index.tsx#L298)

Returns the client of this tree. Either it creates one, such as
`() => createClient({ network: "ic", auth: (network) => new AuthClient(network) })`, and
the provider owns that client and disposes it when it unmounts; or it
returns a client the app created before, at module scope, as
`() => client`, and the provider borrows it and never disposes it.

A factory, not a client, so that the provider decides when it runs: once
per mounted provider, never per render. Give it no work beyond creating or
returning the client (`createClient` does none until the client is used):
React may call it twice in development and keep one result.

Only the factory of the first render is used. A different function on a
later render does not rebuild the client; to replace it, remount the
provider by giving it another `key`.

#### Returns

[`Client`](/docs/ic-reactor/libs/interfaces/client/)

***

### children

> `readonly` **children**: `ReactNode`

Defined in: [react/src/index.tsx:300](https://github.com/B3Pay/ic-reactor/blob/7c822a725a135ee579b83982997d6233fd39e3e7/packages/react/src/index.tsx#L300)

The tree that reads the client with [useClient](/docs/ic-reactor/libs/functions/useclient/) and [useAuth](/docs/ic-reactor/libs/functions/useauth/).
