# IC-ReActor - Store

`@ic-reactor/store` is a state management library designed for applications interacting with the Internet Computer (IC) blockchain. It facilitates the management of actor states, authentication processes, and seamless interaction with IC actors, leveraging the power of `zustand` for global state management.

## Features

- **Actor State Management**: Efficiently manage and update the state of IC actors.
- **Authentication Handling**: Integrated functionality for managing authentication with IC.
- **Zustand Integration**: Utilize `zustand` for global state management in a React-friendly way.
- **Error and Loading State Management**: Easily handle loading states and errors across your application.
- **Asynchronous Interaction Support**: Built-in support for managing asynchronous interactions with IC actors.

## Installation

Install the package using npm:

```bash
npm install @ic-reactor/store
```

or using yarn:

```bash
yarn add @ic-reactor/store
```

## Usage

To use `@ic-reactor/store`, start by creating a ReActor manager with your actor configurations:

```javascript
import createReActorManager from "@ic-reactor/store"
import { createActor, canisterId } from "./declarations/actor"

const reActorManager = createReActorManager((agent) =>
  createActor(canisterId, {
    agent,
  })
)
```

### Managing Actor State

Utilize the ReActor manager to manage the state of your IC actors:

```javascript
// Initialize your actor
reActorManager.initializeActor()

// Access and update actor state
const actorState = reActorManager.store.getState().actorState
```

### Handling Authentication

Manage authentication states and processes:

```javascript
// Authenticate with the IC blockchain
reActorManager.actions
  .authenticate()
  .then(() => {
    // Handle successful authentication
  })
  .catch((error) => {
    // Handle authentication errors
  })
```

## API Reference

`@ic-reactor/store` provides several key functionalities:

- `ReActorManager`: The main class to manage actor states and interactions.
- `createReActorManager`: Factory function to create a new ReActor manager instance.
- State management actions: Methods to initialize actors, handle authentication, and manage global state.

For a detailed API reference, including the complete list of methods and their usage, please refer to the [documentation](#).

## Contributing

Contributions to `@ic-reactor/store` are welcome! Please read our [contributing guidelines](#) for more information.

## License

`@ic-reactor/store` is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
