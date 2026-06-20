# Candid Codegen Playground

Live browser playground for previewing the TypeScript-only IC Reactor codegen
shape from a raw Candid interface.

```bash
pnpm --filter candid-codegen-playground dev
```

The app uses `@ic-reactor/parser` in the browser and mirrors the V0 generator
shape:

```text
<canister>/
  generated.ts
  index.ts
```

It previews generated source only; it does not write files to disk.
