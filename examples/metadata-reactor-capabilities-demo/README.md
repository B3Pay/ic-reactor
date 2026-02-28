# MetadataReactor Capabilities Demo

A focused demo that showcases what `MetadataReactor` can do without requiring a live canister.

## What it demonstrates

- Generate runtime input metadata with `getInputMeta` / `getAllInputMeta`
- Generate runtime output metadata with `getOutputMeta` / `getAllOutputMeta`
- Build dynamic variable references with `buildMethodVariableCandidates`
- Hydrate form values from hex-encoded candid args via `buildForMethod`
- Resolve rich method outputs using metadata-driven resolvers

## Run

```bash
cd examples/metadata-reactor-capabilities-demo
npm install
npm run dev
```

The example defines a local service with query/update methods and complex records/variants,
then renders the generated metadata and resolved sample outputs in the browser.
