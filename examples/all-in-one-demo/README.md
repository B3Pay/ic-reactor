# All-in-One ic-reactor Demo

A comprehensive example demonstrating the power of `@ic-reactor/react` v3. This demo showcases advanced patterns like Optimistic UI, Suspense Queries, Infinite Scrolling, and Authentication.

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

- [DFX SDK](https://internetcomputer.org/docs/current/developer-docs/setup/install/index.mdx)
- Node.js and npm

## 🚀 Setup & Run

1.  **Start the local replica:**

    ```bash
    dfx start --clean --background
    ```

2.  **Deploy the canisters:**

    ```bash
    dfx deploy
    ```

    _Note: Ensure your `.env` file is updated with the correct `CANISTER_ID_BACKEND` if not automatically handled by your environment setup._

3.  **Seed Initial Data (Optional):**

    Create a post to start interacting immediately:

    ```bash
    dfx canister call backend create_post '("Hello from ic-reactor v3!")'
    ```

4.  **Install Frontend Dependencies:**

    ```bash
    npm install
    ```

5.  **Start the Development Server:**

    ```bash
    npm dev
    ```

    Open `http://localhost:5173` to explore the demo!

## 🧪 What to Try

- **Global Heart**: Click the heart. Notice it updates instantly (Optimistic). toggle **Chaos Mode** and click again to see it roll back automatically.
- **Infinite Feed**: Scroll down the posts list. Watch it fetch new pages automatically without blocking the UI.
- **Suspense**: Use React DevTools to "Suspend" the component and see the skeleton loading states.
- **Login**: Authenticate with Internet Identity to see your Principal ID.
