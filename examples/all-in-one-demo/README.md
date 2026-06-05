# All-in-One ic-reactor Demo

A comprehensive example demonstrating the power of `@ic-reactor/react` v3. This demo showcases advanced patterns like Optimistic UI, Suspense Queries, Infinite Scrolling, and Authentication.

**Now powered by [ICP CLI](https://github.com/dfinity/icp-cli)** - the next-generation command-line interface for the ICP SDK.

## 📺 See it in Action

We have recorded short walkthroughs to demonstrate the key features:

|                                 **Optimistic UI & Chaos Mode**                                 |                                  **Suspense & Infinite Scroll**                                  |
| :--------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------: |
| [![Optimistic UI](https://img.youtube.com/vi/5kgLdzH6LgM/0.jpg)](https://youtu.be/5kgLdzH6LgM) | [![Infinite Scroll](https://img.youtube.com/vi/ue4haSsMw_4/0.jpg)](https://youtu.be/ue4haSsMw_4) |
|                          [Watch Video](https://youtu.be/5kgLdzH6LgM)                           |                           [Watch Video](https://youtu.be/ue4haSsMw_4)                            |

## ✨ Features

- **Optimistic Updates**: Instant UI feedback with automatic rollback on failure (Chaos Mode).
- **Infinite Scroll**: Seamless pagination using `createInfiniteQuery`.
- **Suspense Support**: Declarative data fetching with `createSuspenseQuery`.
- **Authentication**: Easy Internet Identity login with `useAuth`.
- **Real-time Logs**: Activity console tracking frontend/backend states.
- **Type Safety**: Full TypeScript support generated from Candid.

## 🛠 Prerequisites

- [ICP CLI](https://github.com/dfinity/icp-cli) - New ICP command-line toolchain
- [mops](https://cli.mops.one/) - Motoko package manager (for Motoko compilation)
- Node.js and npm

### Installing ICP CLI

Currently, you need to build icp-cli locally:

```bash
# Clone the icp-cli repository
git clone https://github.com/dfinity/icp-cli
cd icp-cli

# Build with Rust
cargo build

# Add to path
export PATH=$(pwd)/target/debug:$PATH

# Install the network launcher
# Download from: https://github.com/dfinity/icp-cli-network-launcher/releases
```

### Installing mops (for Motoko)

```bash
# Follow instructions at https://cli.mops.one/
# After installation, initialize the toolchain:
mops toolchain init
```

## 🚀 Setup & Run

1.  **Start the local network:**

    ```bash
    icp network start
    ```

2.  **Deploy the canisters:**

    ```bash
    icp deploy
    ```

    Note the canister IDs printed in the output - they're automatically saved to `.icp/cache/mappings/local.ids.json`.

3.  **Seed Initial Data (Optional):**

    Create a post to start interacting immediately:

    ```bash
    icp canister call backend create_post '("Hello from ic-reactor v3!")'
    ```

4.  **Install Frontend Dependencies:**

    ```bash
    npm install
    ```

5.  **Start the Development Server:**

    ```bash
    npm run dev
    ```

    Open `http://localhost:5173` to explore the demo!

## 📁 Project Structure

```
all-in-one-demo/
├── icp.yaml              # ICP CLI project configuration
├── backend/
│   ├── canister.yaml     # Backend canister build configuration
│   ├── main.mo           # Motoko backend source
│   └── backend.did       # Candid interface
├── internet_identity/
│   └── canister.yaml     # Internet Identity configuration
├── src/
│   ├── lib/
│   │   └── config.ts     # Reactor configuration with withCanisterEnv
│   ├── declarations/     # Generated TypeScript bindings
│   └── ...               # React components
└── vite.config.ts        # Vite config with ic_env cookie setup
```

## 🔧 How it Works

### Environment Variables via `ic_env` Cookie

Unlike the traditional `dfx` approach that uses `.env` files, ICP CLI uses a cookie-based approach:

1. **During deployment**: ICP CLI saves canister IDs to `.icp/cache/mappings/local.ids.json`
2. **During development**: Vite sets an `ic_env` cookie with canister IDs and root key
3. **In production**: The asset canister automatically sets the `ic_env` cookie
4. **In the app**: `@ic-reactor/react` reads the cookie automatically

```typescript
// src/lib/config.ts
export const clientManager = new ClientManager({
  queryClient,
})

export const reactor = new DisplayReactor<_SERVICE>({
  clientManager,
  name: "backend", // Looks up PUBLIC_CANISTER_ID:backend from cookie
  idlFactory,
})
```

## 🧪 What to Try

- **Global Heart**: Click the heart. Notice it updates instantly (Optimistic). Toggle **Chaos Mode** and click again to see it roll back automatically.
- **Infinite Feed**: Scroll down the posts list. Watch it fetch new pages automatically without blocking the UI.
- **Suspense**: Use React DevTools to "Suspend" the component and see the skeleton loading states.
- **Login**: Authenticate with Internet Identity to see your Principal ID.

## 📚 Learn More

- [ICP CLI Documentation](https://github.com/dfinity/icp-cli)
- [IC-Reactor Documentation](https://ic-reactor.b3pay.net/ic-reactor/)
- [@icp-sdk/core Documentation](https://js.icp.build)
