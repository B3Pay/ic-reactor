# IC-Reactor: A Suite of Frontend Utilities for Internet Computer (IC) Development

Welcome to IC-Reactor, a comprehensive collection of JavaScript libraries designed to simplify and enhance frontend development on the Internet Computer (IC) blockchain platform. This project provides a set of tools that cater to various aspects of frontend development, ranging from vanilla JavaScript applications to sophisticated React-based projects.

## Packages Overview

IC-Reactor comprises the following packages, each tailored for specific needs and use cases within the IC ecosystem:

### 1. `@ic-reactor/react`

Aimed at React developers, this library integrates seamlessly with React applications, providing custom hooks and context for managing blockchain interactions. Whether you're querying data from IC actors, updating states, or handling authentication, `@ic-reactor/react` streamlines these processes in a React-friendly way.

### 2. `@ic-reactor/core`

The core library serves as the foundation for managing and interacting with IC actors. It provides essential functionalities like actor initialization, state tracking, and simplified methods for queries and updates. It's a versatile toolkit that can be utilized in various JavaScript environments, ensuring flexibility across different front-end development scenarios.

### 3. `@ic-reactor/store`

This package is the backbone of the IC-Reactor suite. It provides a simple yet powerful state management utility for IC actors. It's designed to be used in conjunction with the other packages, but it can also be used independently in any JavaScript application.

## Versatility Across Front-End Development

Whether you're building a simple vanilla JavaScript application, a complex React project, or anything in between, the IC-Reactor suite is equipped to support your development process. By abstracting the complexities of blockchain interactions and state management, these libraries allow developers to focus on building feature-rich, responsive, and user-friendly front-end applications on the Internet Computer platform.

Leveraging the power of these libraries, developers can efficiently handle a range of tasks from querying and displaying blockchain data to managing user authentication states - all within the familiar ecosystem of JavaScript and React.

# @ic-reactor/react [![@ic-reactor/react](https://badge.fury.io/js/@ic-reactor%2Freact.svg)](https://www.npmjs.com/package/@ic-reactor/react)

`@ic-reactor/react` is a React library designed to seamlessly integrate Internet Computer (IC) blockchain interactions into your React applications. It simplifies the process of managing actor states, performing queries, and handling updates within the IC blockchain ecosystem.

## Key Features

- **React Context Integration**: Utilizes React Context for managing global state related to IC actors.
- **Custom React Hooks**: Provides custom hooks (`useQueryCall`, `useUpdateCall`, `useAuthClient`) for easy interaction with IC actors.
- **Simplified Actor Interaction**: Streamlines the process of querying and updating data from IC actors.
- **Efficient State Management**: Manages loading, error, and data states efficiently within React components.

## Installation

To install `@ic-reactor/react`, run the following command:

```bash
npm install @ic-reactor/react
```

Or using yarn:

```bash
yarn add @ic-reactor/react
```

## Usage

Here's how you can use `@ic-reactor/react` in your React project:

1. **Set Up the Provider**:

   ```jsx
   import createReActor from "@ic-reactor/react"
   import { createActor } from "path-to-your-actor-declaration"

   const { ReActorProvider, useQueryCall, useUpdateCall, useAuthClient } =
     createReActor((agent) => createActor(canisterId, { agent }))

   const App = () => (
     <ReActorProvider>{/* Your App Components */}</ReActorProvider>
   )
   ```

2. **Using Hooks for Queries and Updates**:

   ```jsx
   // Component using useQueryCall hook
   const Balance = ({ principal }) => {
     const { recall, data, loading, error } = useQueryCall({
       functionName: "get_balance",
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

   // Component using useUpdateCall hook
   const Transfer = ({ to, amount }) => {
     const { call, data, loading, error } = useUpdateCall({
       functionName: "transfer",
       args: [to, amount],
     })

     return (
       <div>
         <button onClick={() => call()} disabled={loading}>
           {loading ? "Loading..." : "Transfer"}
         </button>
         {loading && <p>Loading...</p>}
         {data && <p>Transfer Successful!</p>}
         {error && <p>Error: {error}</p>}
       </div>
     )
   }
   ```

## Using the `useAuthClient` Hook

The `useAuthClient` hook is a powerful tool for managing authentication states and actions within your React application. It simplifies the process of logging in, logging out, and maintaining authentication status.

### Basic Usage

1. **Import and Use the Hook**:

   First, import the `useAuthClient` hook into your component.

   ```javascript
   import React from "react"

   const AuthComponent = () => {
     const {
       authClient,
       authenticated,
       authenticating,
       identity,
       login,
       logout,
       authenticate,
       loginLoading,
       loginError,
     } = useAuthClient()

     // Component logic goes here
   }
   ```

2. **Implementing Login and Logout**:

   You can use the `login` and `logout` functions provided by the hook to handle user authentication.

   ```jsx
   const handleLogin = async () => {
     try {
       await login({
         // Optional: AuthClientLoginOptions
         onSuccess: () => console.log("Login Successful"),
         onError: (e) => console.error("Login Failed", e),
       })
     } catch (e) {
       console.error("Error during login", e)
     }
   }

   const handleLogout = async () => {
     await logout()
     // Optional: handle post-logout logic
   }
   ```

3. **Displaying Authentication Status**:

   Utilize the state variables like `authenticated`, `authenticating`, `loginLoading`, and `loginError` to display the current authentication status or any errors.

   ```jsx
   return (
     <div>
       {authenticating ? (
         <p>Authenticating...</p>
       ) : authenticated ? (
         <div>
           <p>Logged in as {identity.getPrincipal().toText()}</p>
           <button onClick={handleLogout}>Logout</button>
         </div>
       ) : (
         <button onClick={handleLogin}>Login</button>
       )}
       {loginLoading && <p>Loading...</p>}
       {loginError && <p>Error: {loginError.message}</p>}
     </div>
   )
   ```

## Examples

For more complex examples, refer to the [`examples`](./examples) directory.

# @ic-reactor/core [![npm version](https://badge.fury.io/js/@ic-reactor%2Fcore.svg)](https://www.npmjs.com/package/@ic-reactor/core)

`@ic-reactor/core` is a foundational library for managing and interacting with Internet Computer (IC) blockchain actors within your application. It simplifies the process of initializing actors, handling state, authentication, performing queries and updates.

## Key Features

- **Efficient Actor Initialization and Management**: Streamline the process of initializing and managing IC actors.
- **State Management**: Track loading, authentication, and error states easily.
- **Query and Update Functionality**: Simplified methods for querying data from actors and updating actor states.
- **Testability**: Built with testing in mind, allowing you to easily test actor interactions.

## Installation

To install `@ic-reactor/core`, run:

```bash
npm install @ic-reactor/core
```

Or with yarn:

```bash
yarn add @ic-reactor/core
```

## Usage

Here's how to use `@ic-reactor/core` in your application:

1. **Create Actor Store and Actions**:

   ```javascript
   import createActorStoreAndActions from "@ic-reactor/core"
   import { canisterId, createActor } from "path-to-your-actor-declaration"

   const { store, actions, queryCall, updateCall, initializeActor } =
     createActorStoreAndActions((agent) => createActor(canisterId, { agent }))
   ```

2. **Query and Update Actor State**:

   ```javascript
   // Query example
   const { initialData, subscribe, getState } = queryCall({
     functionName: "greet",
     args: ["World"],
   })

   console.log(await initialData) // "Hello, World!"

   // Subscribe to updates
   subscribe(({ data, loading, error }) => {
     console.log(data) // Outputs: "Hello, World!"
   })

   // You can use the getState method to access the data
   const { data, loading, error } = getState()

   // Also, you can access the data directly
   const loading = getState("loading")
   const error = getState("error")
   const data = getState("data")
   console.log(data) // Outputs: "Hello, World!"
   ```

3. **Update Actor State**:

   ```javascript
   // Update example
   const { getState, requestHash, subscribe, call } = updateCall({
     functionName: "greet_update",
     args: ["World"],
   })

   // You can use the getState method to access the data
   const { data, loading, error } = getState()

   const response = await call()

   console.log(response) // "Hello, World!"
   ```

# @ic-reactor/store [![@ic-reactor/store](https://badge.fury.io/js/@ic-reactor%2Fstore.svg)](https://www.npmjs.com/package/@ic-reactor/store)

`@ic-reactor/store` is a state management utility designed for applications working with the Internet Computer (IC) blockchain. It provides a simplified way to manage actor states, handle asynchronous calls, and maintain global state in your IC blockchain applications.

## Key Features

- **Simplified Actor State Management**: Manage the state of your actors with ease.
- **Asynchronous Call Handling**: Facilitate asynchronous calls to IC actors.
- **Error and Loading State Management**: Easily track loading and error states across your application.
- **Default State Template**: Start with a predefined default state structure.

## Installation

To install `@ic-reactor/store`, use npm:

```bash
npm install @ic-reactor/store
```

Or with yarn:

```bash
yarn add @ic-reactor/store
```

## Usage

Here's a basic usage example to get started:

1. **Create Actor Store and Actions**:

   ```javascript
   import createActorStoreAndActions from "@ic-reactor/store"
   import { canisterId, createActor } from "path-to-your-actor-declaration"

   const { store, actions, initializeActor } = createActorStoreAndActions(
     (agent) => createActor(canisterId, { agent })
   )
   ```

2. **Initialize Actor and Call Methods**:

   ```javascript
   // Initialize the actor
   initializeActor()

   // Call a method on the actor
   actions.callMethod("greet", "World").then((greeting) => {
     console.log(greeting) // Outputs: "Hello, World!"
   })
   ```

3. **Manage State and Reset**:

   ```javascript
   // Access the global state
   const currentState = store.getState()

   // Reset to the default state when needed
   actions.resetState()
   ```

## Contributing

Contributions to `@ic-reactor/store` are welcome.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
