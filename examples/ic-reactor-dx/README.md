# IC Reactor DX

This example shows a working IC Reactor integration using cod-generated schemas and a Rust ICP canister.

## Local Workflow

Start the local ICP network:

```bash
pnpm network:start
```

Deploy the canister and generate environment variables:

```bash
pnpm deploy
```

Run the Vite browser GUI:

```bash
pnpm dev
```

Open `http://127.0.0.1:5173/` in your browser.

## Commands

- `pnpm network:start` - Start the local replica network in the background.
- `pnpm network:stop` - Stop the local replica network.
- `pnpm deploy` - Build the Rust canister, create it on the replica, install the WASM, and generate the `.env.local` file with canister ID.
- `pnpm dev` - Start the Vite frontend development server.
- `pnpm generate` - Regenerate the TypeScript schema definitions from the Candid file `contact.did`.
- `pnpm typecheck` - Run TypeScript compiler check.
