# Codegen in Action (CLI + Vite Plugin)

This example is designed to test the new shared `@ic-reactor/codegen` flow used by both:

- `@ic-reactor/cli`
- `@ic-reactor/vite-plugin`

## What this example does

It uses a single DID file (`backend/backend.did`) and generates code in two ways:

1. **Vite Plugin path** → `src/canisters-vite/backend`
2. **CLI path** → `src/canisters-cli/backend`

This makes it easy to verify both tools are behaving consistently while relying on the same codegen package.

## Run locally

```bash
cd examples/codegen-in-action
npm install
```

Generate via Vite plugin:

```bash
npm run codegen:vite
```

Generate via CLI:

```bash
npm run codegen:cli
```

Optional app preview:

```bash
npm run dev
```

## Notes

- `reactor.config.json` is prefilled so `codegen:cli` can run without interactive prompts.
- Vite output and CLI output are intentionally separated so you can diff them directly.
