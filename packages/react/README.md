# IC-ReActor - React

`@ic-reactor/react` is a comprehensive React library designed to streamline interactions with the Internet Computer (IC) blockchain. It provides React hooks and utilities for efficient state management, authentication, and interaction with IC actors.

## Features

- **React Hooks Integration**: Custom hooks for managing blockchain actor states and authentication within React applications.
- **Efficient State Management**: Utilize the power of Zustand for global state management in React components.
- **Asynchronous Data Handling**: Easy handling of asynchronous operations related to IC actors.
- **Authentication Support**: Integrated hooks for managing authentication with the IC blockchain.
- **Auto-Refresh and Query Capabilities**: Support for auto-refreshing data and querying IC actors.

## Installation

Install the package using npm:

```bash
npm install @ic-reactor/react
```

or using yarn:

```bash
yarn add @ic-reactor/react
```

## Usage

Here's a simple example to get you started:

First, create an actor declaration file:

```ts
// store.ts
import { canisterId, idlFactory, actor } from "declaration/actor"
import { createReActor } from "@ic-reactor/core"

type Actor = typeof actor

export const { useActorStore, useQueryCall } = createReActor<Actor>({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  host: "https://localhost:4943",
})
```

Then, use the `useQueryCall` hook to call your canister method:

```jsx
// Balance.tsx
import { useQueryCall } from "./store"

const Balance = ({ principal }) => {
  const { call, data, loading, error } = useQueryCall({
    functionName: "get_balance",
    args: [principal],
  })

  return (
    <div>
      <button onClick={() => call()} disabled={loading}>
        {loading ? "Loading..." : "Refresh"}
      </button>
      {loading && <p>Loading...</p>}
      {data && <p>Balance: {data}</p>}
      {error && <p>Error: {error}</p>}
    </div>
  )
}

export default Balance
```

## API Reference

The library provides various hooks and utilities for interacting with IC actors:

- `useActorStore`: Hook for managing actor states.
- `useAuthStore` Hook for managing authentication states.
- `useAuthClient`: Hook for managing authentication with the IC blockchain.
- `useQueryCall`: Hook for querying data from an actor.
- `useUpdateCall`: Hook for updating data in an actor.
- Additional hooks for handling loading, errors, authentication, and more.

For detailed API usage and options, please refer to the [documentation](#).

## Contributing

Contributions to `@ic-reactor/react` are welcome! Please read our [contributing guidelines](#) for more information.

## License

`@ic-reactor/react` is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
