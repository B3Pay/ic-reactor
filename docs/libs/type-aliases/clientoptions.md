---
title: ClientOptions
editUrl: false
next: true
prev: true
---

> **ClientOptions** = `object` & \{ `identity`: `Identity` \| `"anonymous"`; `auth?`: `never`; \} \| \{ `auth`: (`network`) => [`AuthLike`](/docs/ic-reactor/libs/interfaces/authlike/); `identity?`: `never`; \}

Defined in: [core/src/client.ts:189](https://github.com/B3Pay/ic-reactor/blob/7c822a725a135ee579b83982997d6233fd39e3e7/packages/core/src/client.ts#L189)

Options for [createClient](/docs/ic-reactor/libs/functions/createclient/): a network, and exactly one of `identity`
and `auth`, so that who calls is always written down.

## Type Declaration

### network

> `readonly` **network**: [`Network`](/docs/ic-reactor/libs/type-aliases/network/)

Where the canisters are. See [Network](/docs/ic-reactor/libs/type-aliases/network/).

### allowEnvConfig?

> `readonly` `optional` **allowEnvConfig?**: `boolean`

Whether the `ic_env` cookie (root key and canister ids) is believed. See
the `network` option; absent trusts it only when both the page and the
replica are local. Even `true` never takes the cookie's root key for a
mainnet host, and `true` is refused (a `TypeError`) on a page under
`ic0.app`, `github.dev`, `gitpod.io`, `loca.lt` or `devtunnels.ms`, which
are not public suffixes.

### fetch?

> `readonly` `optional` **fetch?**: *typeof* `globalThis.fetch`

The `fetch` every agent of this client sends with. Defaults to the global
one. Tests pass a fake replica's `fetch` here; nothing global is touched.

### maxDepth?

> `readonly` `optional` **maxDepth?**: `number`

How deep a decoded reply may nest. Defaults to 256. Raise it for replies
that nest deeper, such as an ICRC-3 block log's values.

### maxElements?

> `readonly` `optional` **maxElements?**: `number`

How many values a decoded reply may hold, beyond one per byte of the
reply. Defaults to 1,000,000. A reply is always allowed one value per byte
on top of this, so a blob (a wasm module, an asset chunk) of any size the
IC returns decodes; this bounds only the values that take no bytes, such
as a long `vec null`.
