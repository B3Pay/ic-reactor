# IC-ReActor

[![npm version](https://badge.fury.io/js/%40ic-reactor%2Fcore.svg)](https://badge.fury.io/js/%40ic-reactor%2Fcore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Introduction

Ic-reactor is a TypeScript library designed to simplify interactions between your frontend application and canisters on the Internet Computer. Leveraging the power of the `zustand` state management library and strong typing, Ic-reactor aims to make your development process smoother and more efficient.

## Installation

To install Ic-reactor, run the following command:

```bash
npm install @ic-reactor/core
```

## Features

- **Strong Typing**: Ensures type safety between your frontend and canister.
- **State Management**: Built-in state management using `zustand`.
- **Easy to Use**: Simplified API for quick integration into your projects.
- **Flexible**: Compatible with both React and non-React projects.

## React - Usage

Here's a simple example to get you started:

First, create an actor declaration file:

```js
// store.js
import { canisterId, createActor } from "declaration/actor"
import { createReActor } from "@ic-reactor/core"

export const { ReActorProvider, useQueryCall } = createReActor(() =>
  createActor(canisterId)
)
```

Wrap your app with the `ReActorProvider` component:

```jsx
// index.jsx
const App = () => (
  <ReActorProvider>
    <Balance />
  </ReActorProvider>
)
```

Then, use the `useQueryCall` hook to call your canister method:

```jsx
// Balance.jsx
import { useQueryCall } from "./store"

const Balance = ({ principal }) => {
  const { recall, data, loading, error } = useQueryCall({
    functionName: "ge_balance",
    args: [principal],
  })

  return (
    <div>
      <button onClick={() => recall()} disabled={loading}>
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

## Examples

For more complex examples, refer to the [`examples`](./examples) directory.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
