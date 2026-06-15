# TanStack Form Demo

This example shows how to build a dynamic React form from Candid metadata.

It uses `FieldVisitor` from `@ic-reactor/candid` to inspect a sample Candid
function signature, then renders the generated field tree with
`@tanstack/react-form`.

## What it demonstrates

- Building form defaults and validation from Candid IDL
- Mapping `FieldNode.component` values to React field components
- Rendering nested records, variants, options, vectors, blobs, principals, and
  primitive Candid values
- Submitting the form as structured values that match the generated metadata

This is a local UI demo only. It does not connect to a canister, does not use
Internet Identity, and does not need `@ic-reactor/vite-plugin` or an `ic_env`
cookie.

## Run locally

From this directory:

```bash
pnpm install
pnpm run dev
```

Then open the Vite URL printed in the terminal.

## Build

```bash
pnpm run build
```
