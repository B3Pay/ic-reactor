---
title: createClient
editUrl: false
next: true
prev: true
---

> **createClient**(`options`): [`Client`](/docs/ic-reactor/libs/interfaces/client/)

Defined in: [core/src/client.ts:1302](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L1302)

Creates a client: who calls, on which network, with which cache.

Say who calls with exactly one of `identity` and `auth`. `auth` takes a
factory, which the client calls on first use and only in a browser, so the
same `createClient(...)` line runs in a server render (anonymous, no auth
built) and in the browser (signed in).

Build one client per browser tab, or one per request on a server: a client's
cache and agents belong to whoever it calls as, and two clients share
neither.

## Parameters

### options

[`ClientOptions`](/docs/ic-reactor/libs/type-aliases/clientoptions/)

## Returns

[`Client`](/docs/ic-reactor/libs/interfaces/client/)

## Throws

TypeError for options that do not say who calls, say it twice, or
name a network or `maxDepth` that cannot be used; for an option it does not
have (in the options or in a network object); and for an `allowEnvConfig`
or `fetchRootKey` that is not a boolean, a `rootKey` that is not 133 bytes
in a `Uint8Array`, or a `fetch` that is not a function.

## Example

```ts
import { AuthClient } from "@icp-sdk/auth/client"
import { createClient } from "@ic-reactor/core"

const client = createClient({ network: "ic", auth: (network) => new AuthClient(network) })
client.subscribe(() => console.log(client.authState()))
await client.signIn()
```
