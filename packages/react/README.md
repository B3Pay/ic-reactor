`@ic-reactor/react` is a comprehensive React library designed to streamline interactions with the Internet Computer (IC) blockchain. It provides React hooks and utilities for efficient state management, authentication, and interaction with IC actors.

## Features

- **React Hooks Integration**: Custom hooks for managing blockchain actor states and authentication within React applications.
- **Type-Safe Actor Interactions**: Type-safe interaction with IC actors using the provided actor declaration file.
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
// actor.ts
import { canisterId, idlFactory, actor } from "declaration/actor"
import { createReactor } from "@ic-reactor/react"

type Actor = typeof actor

export const { useActorStore, useAuth, useQueryCall } = createReactor<Actor>({
  canisterId,
  idlFactory,
  host: "https://localhost:4943",
})
```

Then, use the `useQueryCall` hook to call your canister method:

```jsx
// Balance.tsx
import { useQueryCall } from "./actor"

const Balance = ({ principal }) => {
  const { call, data, loading, error } = useQueryCall({
    functionName: "get_balance",
    args: [principal],
    refetchInterval: 1000,
    refetchOnMount: true,
    onLoading: () => console.log("Loading..."),
    onSuccess: (data) => console.log("Success!", data),
    onError: (error) => console.log("Error!", error),
  })

  return (
    <div>
      <button onClick={call} disabled={loading}>
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

## Authentication

`@ic-reactor/react` provides a custom hook for managing authentication with the IC blockchain. To use it, first create an authentication declaration file:

```jsx
// Login.tsx
import { useAuth } from "./actor"

const Login = () => {
  const {
    login,
    logout,
    loginLoading,
    loginError,
    identity,
    authenticating,
    authenticated,
  } = useAuth()

  return (
    <div>
      <h2>Login:</h2>
      <div>
        {loginLoading && <div>Loading...</div>}
        {loginError ? <div>{JSON.stringify(loginError)}</div> : null}
        {identity && <div>{identity.getPrincipal().toText()}</div>}
      </div>
      {authenticated ? (
        <div>
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <div>
          <button onClick={login} disabled={authenticating}>
            Login
          </button>
        </div>
      )}
    </div>
  )
}

export default Login
```
