# IC-Reactor: A Suite of Frontend Utilities for Internet Computer (IC) Development

Welcome to IC-Reactor, a comprehensive collection of JavaScript libraries designed to simplify and enhance frontend development on the Internet Computer (IC) blockchain platform. This project provides a set of tools that cater to various aspects of frontend development, ranging from vanilla JavaScript applications to sophisticated React-based projects.

## Packages Overview

IC-Reactor comprises the following packages, each tailored for specific needs and use cases within the IC ecosystem:

### 1. `@ic-reactor/react`

Aimed at React developers, this library integrates seamlessly with React applications, providing custom hooks and context for managing blockchain interactions. Whether you're querying data from IC actors, updating states, or handling authentication, `@ic-reactor/react` streamlines these processes in a React-friendly way.

### 2. `@ic-reactor/core`

The core library serves as the foundation for managing and interacting with IC actors. It provides essential functionalities like actor initialization, state tracking, and simplified methods for queries and updates. It's a versatile toolkit that can be utilized in various JavaScript environments, ensuring flexibility across different front-end development scenarios.

### 3. `@ic-reactor/core`

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

## [Usage](./packages/react/README.md)

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

## [Usage](./packages/core/README.md)

# @ic-reactor/core [![@ic-reactor/core](https://badge.fury.io/js/@ic-reactor%2Fstore.svg)](https://www.npmjs.com/package/@ic-reactor/core)

`@ic-reactor/core` is a state management utility designed for applications working with the Internet Computer (IC) blockchain. It provides a simplified way to manage actor states, handle asynchronous calls, and maintain global state in your IC blockchain applications.

## Key Features

- **Simplified Actor State Management**: Manage the state of your actors with ease.
- **Asynchronous Call Handling**: Facilitate asynchronous calls to IC actors.
- **Error and Loading State Management**: Easily track loading and error states across your application.
- **Default State Template**: Start with a predefined default state structure.

## Installation

To install `@ic-reactor/core`, use npm:

```bash
npm install @ic-reactor/core
```

Or with yarn:

```bash
yarn add @ic-reactor/core
```

## [Usage](./packages/store/README.md)

## We Welcome Feature Requests and Contributions

### Feature Requests

Your feedback and ideas are invaluable in helping IC-Reactor evolve and improve. We warmly welcome feature requests and suggestions that can enhance the functionality and usability of our libraries. If there's something you'd like to see added or improved, please feel free to share your thoughts:

- **Submit a Feature Request**: You can use the GitHub Issues section of the respective package repository to submit feature requests. Please provide as much detail as possible about the feature and how it would benefit users.

- **Discussion and Planning**: Our team is open to discussing potential features and their implementation. We value community input and are always looking for ways to make our tools more useful and accessible.

### Contributing to IC-Reactor

IC-Reactor is an open-source project, and we encourage contributions from developers of all skill levels. Whether you're fixing bugs, adding features, or improving documentation, your help is welcome. Here's how you can contribute:

1. **Check the Issues**: Browse the existing issues for bugs or feature requests that interest you. You can also create a new issue if you have a proposal or have identified a bug.

2. **Fork and Clone**: Fork the repository you wish to contribute to, and clone it to your local machine.

3. **Create a Branch**: Make your changes in a new branch. Naming your branch something relevant to your changes can be helpful.

4. **Develop and Test**: Make your changes and test them thoroughly. Ensure you adhere to the existing code style and guidelines.

5. **Submit a Pull Request**: Once you're satisfied with your changes, push your branch to your fork and submit a pull request to the main repository. Provide a clear description of your changes and any relevant issue numbers.

6. **Review and Merge**: The maintainers will review your pull request and either merge it or request changes. If your pull request is merged, you will be credited as a contributor.

### Join Our Community

We believe in the power of community collaboration to create amazing tools. Your contributions, whether code, ideas, or feedback, are crucial to the success and growth of IC-Reactor. Join us in our mission to build effective and user-friendly tools for Internet Computer blockchain development!

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
