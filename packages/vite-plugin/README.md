# @ic-reactor/vite-plugin

> **ic-reactor 4 is in development on the `v4` branch.** This package is at a
> `4.0.0-alpha` version that is not published. The released 3.x plugin, which
> also generates bindings, is documented at
> https://ic-reactor.b3pay.net/v3/packages/vite-plugin.

On the `v4` branch the plugin is the environment half of the 3.x plugin: under
`vite dev` and `vite preview` it sets the `ic_env` cookie and proxies `/api` to
the local IC network. Binding generation returns as a `candid-core-cli gen`
child process in a later change.

## Quick Start

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    icReactor({
      canisters: [{ name: "backend" }],
    }),
  ],
})
```

## Options

| Option              | Default | Meaning                                                                                                 |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `canisters`         | —       | `{ name, canisterId? }` for each canister whose ID the cookie carries; a `canisterId` wins over `icp`'s |
| `injectEnvironment` | `true`  | Set the cookie and the `/api` proxy under `vite dev` and `vite preview`                                 |

## Local Development Behavior

When `injectEnvironment` is enabled during `vite dev` or `vite preview`, the
plugin:

1. asks `icp` for the local network status
2. resolves canister IDs — `internet_identity` is added automatically if not
   already in your canister list
3. sets the `ic_env` cookie on each response
4. proxies `/api` to the local replica

If a canister has a `canisterId` set in the plugin config, that value overrides
the auto-detected ID for that canister.

Set the `ICP_ENVIRONMENT` environment variable to target a non-default network
(defaults to `"local"`).

If environment detection fails, the plugin falls back to proxying `/api` to
`http://127.0.0.1:4943`, and sets no cookie, or with no canisters configured one
that names only icp-cli's built-in Internet Identity. It warns when that happens
with canisters configured, and when a configured canister has no ID, because
the failure is otherwise indistinguishable from success until the app breaks on
an undefined canister id. Run with `DEBUG=ic-reactor` to see the `icp` output
behind the warning.

Detection is complete once `icp` reports the network and every configured
canister has an ID. Until then the plugin asks `icp` again on each page load,
and that page gets the answer: start `vite dev` first, then run
`icp network start` and `icp deploy`, and reload the page. The `/api` proxy
moves to the network `icp` reports, the fallback included. Once detection is
complete, page loads run no further `icp` commands, so redeploying into a
fresh network, with new canister IDs and a new root key, needs a dev server
restart. A configured canister you never deploy locally keeps detection
incomplete, so every page load runs `icp` for it; set its `canisterId` and it
counts as resolved. If you never run a local network, set
`injectEnvironment: false` and page loads run no `icp`.

If your Vite config or another plugin sets `server.proxy["/api"]`, the plugin
leaves that entry alone, whether detection succeeds or not, and that proxy does
not follow detection.
