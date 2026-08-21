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

- Which package and version (`@ic-reactor/core`, `@ic-reactor/react`, `@ic-reactor/candid`, `@ic-reactor/parser`, `@ic-reactor/codegen`, `@ic-reactor/cli`, `@ic-reactor/vite-plugin`)
- A minimal reproduction — a config file, a `.did`, or a short script
- What an attacker controls, and what they gain
- Any known workaround

## Supported versions

| Package                                 | Supported |
| --------------------------------------- | --------- |
| `@ic-reactor/{core,react,candid}`       | `3.x`     |
| `@ic-reactor/{codegen,cli,vite-plugin}` | `0.12.x`  |
| `@ic-reactor/parser`                    | `0.4.x`   |

Fixes land on the latest minor of each supported line. Older minors are not backported.

## Threat model

IC Reactor is a client-side library plus a build-time code generator. Two boundaries matter, and they have different trust assumptions.

### Runtime (`core`, `react`, `candid`, `parser`)

These run in the user's browser or on their server. In scope:

- Anything that causes one principal's canister data to be served to another (cache-key scoping, identity-switch handling, SSR request isolation)
- Anything that weakens certificate verification — in particular how the agent's root key is chosen
- Anything that mishandles delegations or identity material
- Candid decoding of hostile canister responses

Out of scope: a canister returning wrong data is the canister's problem, not the library's, unless the library misrepresents it as verified.

### Build time (`codegen`, `cli`, `vite-plugin`)

**These treat `ic-reactor.json` and plugin options as untrusted input.** The pipeline turns config values into filesystem paths it recursively deletes, and into source text it writes into the consumer's bundle. A developer who clones a repository and runs `pnpm install && pnpm dev` should not thereby give that repository the ability to delete files outside the project or execute code of its choosing.

In scope:

- A config value that resolves to a path outside the project root
- A config value that injects source text into generated output
- A `.did` file whose contents or filename influence anything beyond the declarations it describes

Out of scope: a developer explicitly and knowingly pointing `outDir` somewhere destructive within their own project.

## Disclosure

We will credit reporters who want it. If you plan to publish, please give us 90 days from acknowledgement, or until a fix ships — whichever comes first.
