---
title: Network
editUrl: false
next: true
prev: true
---

> **Network** = `"ic"` \| `"local"` \| `"env"` \| \{ `host`: `string`; `rootKey?`: `Uint8Array`; `name?`: `string`; `fetchRootKey?`: `boolean`; \}

Defined in: [core/src/network.ts:89](https://github.com/B3Pay/ic-reactor/blob/cd4c701ce278affefc56cd7128634e1ec9d35897/packages/core/src/network.ts#L89)

Where the canisters are.

- `"ic"`: mainnet, through `https://icp-api.io`, checked against the
  mainnet root key the agent ships with. Nothing is fetched.
- `"local"`: icp-cli's local network, `http://127.0.0.1:8000`. Its root key
  is fetched from the replica before the first call. A dfx replica (port
  4943) is an object: `{ host: "http://127.0.0.1:4943" }`.
- `"env"`: the network of the page this code runs in, as an asset canister
  or a dev server describes it. In a browser, a page on a local replica or
  on a mainnet boundary domain routes through its own origin, and so does
  a page that forwards a dev server: Codespaces, Gitpod, a LAN address
  (RFC 1918, link-local, IPv6 ULA), a Tailscale address or name
  (100.64/10, `*.ts.net`), a LAN name with no dot such as `devbox`, a
  `*.local`, `*.test` or `*.internal` name such as `host.docker.internal`,
  or a tunnel (ngrok, `trycloudflare.com`, `loca.lt`, VS Code's
  `devtunnels.ms`). `"env"` is for localhost pages: those
  others never reach mainnet, but none is local. The root key
  comes from the `ic_env` cookie, but only where that cookie is trusted:
  when both the page and the replica are local, or the client was built
  with `allowEnvConfig: true`. On a canister's own `<id>.icp0.io` page the
  cookie's canister ids are believed by default, never its root key. A
  local replica with no key from the cookie has its root key fetched. A
  forwarding page is routed but is not local, so there the key is neither
  taken from the cookie nor fetched,
  and the agent checks the forwarded replica's certificates against
  mainnet's key, so every certified call fails verification. Name the
  replica with an object that has a `rootKey` (or `fetchRootKey: true`)
  and the canisters with `{ id }`: on a dev container or a localtunnel,
  `allowEnvConfig: true` is refused, because every workspace or tunnel is
  a sibling of every stranger's. On a
  mainnet host the cookie's root key is never taken, even with
  `allowEnvConfig: true`: the agent keeps mainnet's own. On a server there
  is no page and no cookie: the host is `ICP_HOST` or `IC_HOST` when
  `ICP_NETWORK` is `"local"` (`http://127.0.0.1:8000` if neither is set),
  and mainnet otherwise. With no `ICP_NETWORK`, dfx's `DFX_NETWORK=local`
  counts too, and its default is dfx's `http://127.0.0.1:4943`.
- An object: any other replica. `rootKey` is used as given and never
  fetched. Without one the root key is fetched only when `host` is local
  (`localhost`, `*.localhost` or any loopback address), unless `fetchRootKey`
  says otherwise. A replica behind a Codespaces, Gitpod or custom domain is
  not local: pass its `rootKey`, or write `fetchRootKey: true` to trust the
  key it reports. `name` is the network's segment in query keys and defaults
  to `host`.

## Union Members

`"ic"`

***

`"local"`

***

`"env"`

***

### Type Literal

\{ `host`: `string`; `rootKey?`: `Uint8Array`; `name?`: `string`; `fetchRootKey?`: `boolean`; \}

#### host

> `readonly` **host**: `string`

The replica's URL, over `http:` or `https:`. A host with no scheme is
read against the page's protocol, as `HttpAgent` reads it, and is
refused where there is no page. `createClient` throws a `TypeError`
for any other host, such as `localhost:4943`, which reads as the
scheme `localhost:`.

#### rootKey?

> `readonly` `optional` **rootKey?**: `Uint8Array`

The root key certificates are verified against. Used as given and
never fetched, even where `fetchRootKey` is `true`.

#### name?

> `readonly` `optional` **name?**: `string`

This network's segment in query keys. Defaults to `host`.

#### fetchRootKey?

> `readonly` `optional` **fetchRootKey?**: `boolean`

Whether to fetch the root key from the replica when `rootKey` is
absent. Defaults to whether `host` is local. Writing `true` for a host
that is not local trusts whatever key that host reports, which is why it
is never the default.
