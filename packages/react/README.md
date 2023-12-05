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

To use `@ic-reactor/react`, start by importing and setting up the `createReActor` function with your actor configurations:

```javascript
import createReActor from '@ic-reactor/react';

const actorInitializer = /* Your actor initialization logic */;
const reActorConfig = /* Your ReActor configuration options */;

const { ReActorProvider, useReActorQuery, useReActorUpdate, ... } = createReActor(actorInitializer, reActorConfig);
```

Then, wrap your React application with the `ReActorProvider` component:

```javascript
const App = () => (
  <ReActorProvider>
    <YourApp />
  </ReActorProvider>
)
```

Finally, use the `useReActorQuery` and `useReActorUpdate` hooks to query and update actor state:

### Example: Querying Actor State

```javascript
const { recall, data, loading, error } = useQueryCall({
  functionName: "fetchData",
  args: ["arg1", "arg2"],
  autoRefresh: true, // default: true
  refreshInterval: 3000, // default: 5000
  disableInitialCall: false, // default: false
})

// Use 'data', 'loading', 'error' in your component
```

### Example: Updating Actor State

```javascript
const { call, data, loading, error } = useUpdateCall({
  functionName: "updateData",
  args: ["arg1", "arg2"],
})

// Call the 'call' function to trigger an update call
```

## API Reference

The library provides various hooks and utilities for interacting with IC actors:

- `useQueryCall`: Hook for querying data from an actor.
- `useUpdateCall`: Hook for updating data in an actor.
- `useReActor`: Hook to access the global actor state.
- `ReActorProvider`: React context provider for ReActor state.
- Additional hooks for handling loading, errors, authentication, and more.

For detailed API usage and options, please refer to the [documentation](#).

## Contributing

Contributions to `@ic-reactor/react` are welcome! Please read our [contributing guidelines](#) for more information.

## License

`@ic-reactor/react` is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

---

This README provides a foundational overview of your package. You should expand it with more detailed documentation, examples, and links to additional resources or documentation as needed. Replace placeholders with actual information and links relevant to your project.
