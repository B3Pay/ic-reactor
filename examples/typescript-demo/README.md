# IC Reactor Core + TypeScript Demo

This project demonstrates how to use `@ic-reactor/core` with TypeScript in a vanilla Vite project.

## Features

- **Store Initialization**: Shows how to create a reactor store with `createReactorStore`.
- **Actor Management**: configuring actors (Ledger in this case) with `canisterId` and `idlFactory`.
- **Authentication**: Implementing Internet Identity login/logout using `AgentManager`.
- **Query Calls**: Calling canister methods (e.g., `name`, `symbol`, `decimals`) using the actor instance.
- **Type Safety**: Using TypeScript for actor interfaces.

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the development server:

   ```bash
   pnpm dev
   ```

3. Build for production:
   ```bash
   pnpm build
   ```

## Key Files

- `src/main.ts`: Main entry point containing the core logic.
- `src/declarations/ledger.ts`: Type definitions and IDL for the Ledger canister.
