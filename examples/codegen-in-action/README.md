# Codegen in Action (CLI + Vite Plugin + icp-cli local env)

This example is designed to test the shared `@ic-reactor/codegen` flow used by both:

- `@ic-reactor/cli`
- `@ic-reactor/vite-plugin`

It validates **zero-config icp-cli local canister environment wiring** via `@ic-reactor/vite-plugin` automatic `ic_env` cookie injection.

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

## Validate local canister env with new icp-cli

1. Start local network:

   ```bash
   icp network start
   ```

2. Deploy your project canisters (in a project that has `icp.yaml`):

   ```bash
   icp deploy
   ```

   This writes canister IDs to `.icp/cache/mappings/local.ids.json`.

3. Run this example:

   ```bash
   npm run dev
   ```

`@ic-reactor/vite-plugin` automatically reads `.icp/cache/mappings/local.ids.json` in dev mode and sets:

- `ic_root_key=<local-root-key>`
- `PUBLIC_CANISTER_ID:<name>=<canister-id>`

inside the `ic_env` cookie, so `withCanisterEnv: true` clients resolve local canister IDs automatically with zero extra Vite cookie configuration.

## Notes

- `ic-reactor.json` is prefilled so `codegen:cli` can run without interactive prompts.
- Vite output and CLI output are intentionally separated so you can diff them directly.
- If `.icp/cache/mappings/local.ids.json` is missing, the plugin logs a hint and Vite still starts, but canister ID resolution from cookie will stay empty until `icp deploy` is run.
