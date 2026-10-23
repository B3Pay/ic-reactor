# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Report it privately through GitHub's private vulnerability reporting:

1. Go to <https://github.com/B3Pay/ic-reactor/security/advisories/new>
2. Describe the issue, the affected package and version, and how to reproduce it.

If private reporting is unavailable, open a public issue containing only "security report — please provide a private contact" and no technical detail, and a maintainer will follow up with a private channel.

We aim to acknowledge a report within 5 working days.

## What to include

The more of this you can provide, the faster a fix lands:

- Which package and version (`@ic-reactor/core`, `@ic-reactor/react`, `@ic-reactor/vite-plugin`, or a 3.x package: `@ic-reactor/candid`, `@ic-reactor/parser`, `@ic-reactor/codegen`, `@ic-reactor/cli`)
- A minimal reproduction — a config file, a `.did`, or a short script
- What an attacker controls, and what they gain
- Any known workaround

## Supported versions

| Package                                 | Supported |
| --------------------------------------- | --------- |
| `@ic-reactor/{core,react,candid}`       | `3.x`     |
| `@ic-reactor/{codegen,cli,vite-plugin}` | `0.13.x`  |
| `@ic-reactor/parser`                    | `0.4.x`   |

Fixes land on the latest minor of each supported line. Older minors are not backported.

## Threat model

This section is ic-reactor 4's: `@ic-reactor/core`, `@ic-reactor/react` and `@ic-reactor/vite-plugin` 4.x. The 3.x packages' threat model is in the [`v3` branch's SECURITY.md](https://github.com/B3Pay/ic-reactor/blob/v3/SECURITY.md).

ic-reactor 4 is a client library and a Vite plugin. Two boundaries matter, and they have different trust assumptions.

### Runtime (`core`, `react`)

These run in the user's browser or on their server. In scope:

- Anything that serves one principal's canister data to another: the caller-scoped query keys, a sign-in or sign-out while a fetch runs, and one client per request on a server
- Anything that weakens certificate verification, in particular which root key a client takes: mainnet's built-in key, a key given in `network`, or one fetched only from a local host
- Anything that lets untrusted input choose which canister a call is routed to. Certificate verification does not cover this: a substituted canister ID names a real canister, whose responses verify against the real root key. That includes the `ic_env` cookie: core believes its canister IDs only on a local replica, on a canister's own `<id>.icp0.io` page, or with `allowEnvConfig: true`, and never takes its root key for a mainnet host
- Anything that mishandles delegations or identity material
- An error that says a write did not execute when it may have, so that resending it can execute it twice

Out of scope:

- A canister returning wrong data, unless the library presents it as verified
- `@ic-reactor/core/testing`: its fake replica and test client are for tests, not for production

Candid encoding and decoding are `@candid-core/schema`'s. Report a decoding bug, such as a hostile reply that decodes to the wrong value or crashes the decoder, to candid-core through <https://github.com/b3hr4d/candid-core/security/advisories/new>.

### Development and build (`vite-plugin`)

The plugin runs in `vite dev`, `vite preview` and `vite build`. Its options come from the Vite config, which is code the developer runs, so they are trusted. A `.did` file, its name, and an interface fetched from a network are not. In scope:

- **The generator.** The plugin runs `candid-core-cli gen` from the app's `node_modules`, with the running Node binary, in a child process and not through a shell. Anything that makes it run another program, or turns a `.did` path into anything but an argument, is in scope.
- **Live interfaces.** A missing `didFile` is written from the canister's `candid:service` metadata, read from certified state, and `verify: "live"` compares a `didFile` with it. Anything that writes or accepts an interface that does not verify against the network's root key, or writes outside the configured `didFile`, is in scope.
- **The `ic_env` cookie and the `/api` proxy** under `vite dev` and `vite preview`. A cookie that names a canister the local network did not report for that name, for example after the network restarted, or a proxy that sends requests to a host other than the local network, is in scope.
- **Generated files.** A `.did` file or a fetched interface that writes outside the configured `outDir`, or puts code into a generated module beyond the declarations it describes. `candid-core-cli` writes the module, so the fix can be candid-core's.

Out of scope: a developer's own Vite config pointing `outDir` or `didFile` somewhere destructive.

If you are unsure which project a bug belongs to, report it here, and we will move it.

## Disclosure

We will credit reporters who want it. If you plan to publish, please give us 90 days from acknowledgement, or until a fix ships — whichever comes first.
