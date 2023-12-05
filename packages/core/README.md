# IC-ReActor - Core

ReActor is a JavaScript utility designed to streamline state management and interaction with actors in the Internet Computer (IC) blockchain environment. It provides a simple and effective way to handle asynchronous calls, state updates, and subscriptions, making it easier to build responsive and data-driven applications.

## Features

- **State Management**: Efficiently manage the state of your application with actor-based interactions.
- **Asynchronous Handling**: Simplify asynchronous calls and data handling with built-in methods.
- **Subscription Mechanism**: Subscribe to state changes and update your UI in real-time.
- **Auto-Refresh Capability**: Automatically refresh data at specified intervals.
- **Customizable**: Easily adaptable to various use cases within the IC ecosystem.

## Installation

```bash
npm install @ic-reactor/core
```

or

```bash
yarn add @ic-reactor/core
```

## Usage

To get started with ReActor, you'll need to initialize it with your actor configurations. Here's a basic example:

```javascript
import createReActor from "@ic-reactor/core"

const { store, actions, initializeActor, queryCall, updateCall } =
  createReActor(
    (agent) =>
      createActor("bd3sg-teaaa-aaaaa-qaaba-cai", {
        agent,
      }),
    {
      host: "https://localhost:4943",
    }
  )
```

### Querying Data

```javascript
const { recall, subscribe, getState } = queryCall({
  functionName: "yourFunctionName",
  args: ["arg1", "arg2"],
  autoRefresh: true,
  refreshInterval: 3000,
})

// Subscribe to changes
const unsubscribe = subscribe((newState) => {
  // Handle new state
})

// Fetch data
recall().then((data) => {
  // Handle initial data
})
```

### Updating Data

```javascript
const { call } = updateCall({
  functionName: "yourUpdateFunction",
  args: ["arg1", "arg2"],
})

call().then((result) => {
  // Handle result
})
```

## API Reference

- `queryCall`: Fetches and subscribes to data from an actor method.
- `updateCall`: Updates data and handles state changes for an actor method.
- `getState`: Retrieves the current state based on the request hash.
- `subscribe`: Allows subscription to state changes.

For more detailed API usage and options, please refer to the [documentation](#).

## Contributing

Contributions are welcome! Please read our [contributing guidelines](#) to get started.

## License

This project is licensed under [MIT License](LICENSE).
