# Re-Actor

## Introduction

Re-actor is a TypeScript library designed to simplify interactions between your frontend application and canisters on the Internet Computer. Leveraging the power of the `zustand` state management library and strong typing, Re-actor aims to make your development process smoother and more efficient.

## Installation

To install Re-actor, run the following command:

```bash
npm install @re-actor/core
```

## Features

- **Strong Typing**: Ensures type safety between your frontend and canister.
- **State Management**: Built-in state management using `zustand`.
- **Easy to Use**: Simplified API for quick integration into your projects.
- **Flexible**: Compatible with both React and non-React projects.

## Usage

Here's a simple example to get you started:

```jsx
import createReActor from "@re-actor/core"
import { canisterId, createActor } from "declaration/actor"

const { ReActorProvider, useActorMethod } = createReActor(() =>
  createActor(canisterId)
)

const Balance = () => {
  const { call, data, error, loading } = useActorMethod("get_balance")

  return (
    <div>
      <button onClick={() => call()}>Fetch Balance</button>
      {loading && <p>Loading...</p>}
      {data && <p>Balance: {data}</p>}
      {error && <p>Error: {error}</p>}
    </div>
  )
}

const App = () => (
  <ReActorProvider>
    <Balance />
  </ReActorProvider>
)
```

For more detailed examples, check the [`examples`](./examples) directory.

## API Reference

### `useActorMethod`

This hook allows you to call a method from your canister and manage its state.

```typescript
const { call, data, error, loading } = useActorMethod("methodName")
```

- `call`: A function that calls the canister method.
- `data`: The data returned from the canister method.
- `error`: Any error that occurred while calling the canister method.
- `types`: The candid types of the canister method.
- `loading`: A boolean indicating whether the data is being fetched.

## Examples

For more complex examples, refer to the [`examples`](./examples) directory.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
