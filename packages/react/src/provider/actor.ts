import { ActorHooks } from "../context"

/**
 * `ActorProvider` is a React functional component that serves as a context provider for IC actor interactions within a React application.
 * It wraps child components, providing them access to actor-specific hooks and functionalities based on the provided canister ID and configuration.
 *
 * Props:
 * - `canisterId` (optional): string - The Canister ID for actor interactions. If not provided, the default from `createActorContext` is used.
 * - `idlFactory` (optional): IDL.InterfaceFactory - The IDL factory for the actor interface. If not provided, the default from `createActorContext` is used.
 * - `didjsId` (optional): string - The DID.js ID for authentication. If not provided, the default from `createActorContext` is used.
 * - `loadingComponent` (optional): React Node - A component displayed during the loading/fetching state. Defaults to a simple message.
 * - `authenticatingComponent` (optional): React Node - A component displayed during the authentication state. Defaults to a simple message.
 * - `children`: React Node - The child components that will have access to the actor context.
 *
 * Behavior:
 * - Validates the presence of a `canisterId`. Throws an error if it is missing, ensuring that a valid canister ID is always used for actor operations.
 * - Utilizes `useMemo` to combine the default configuration with the props provided to the `ActorProvider`, optimizing for performance by avoiding unnecessary recalculations.
 * - Employs the `useActor` hook to initiate actor interactions based on the combined configuration, managing states such as `fetching`, `fetchError`, and the actor `hooks`.
 * - Conditionally renders the `loadingComponent` or `fetchError` based on the actor fetching state. Once the actor is ready and no errors are present, it renders the child components, effectively providing them access to the actor context.
 *
 * @example
 * ```jsx
 * <ActorProvider canisterId="your-canister-id" idlFactory={yourIdlFactory}>
 *   <YourComponent />
 * </ActorProvider>
 * ```
 * This setup ensures that `YourComponent` and any of its children can interact with the specified IC actor through the context provided by `ActorProvider`.
 */
export const ActorProvider = ActorHooks.ActorProvider

/**
 * `ActorHookProvider` is a React functional component that serves as a context provider for IC actor hooks within a React application.
 * It wraps child components, providing them access to actor-specific hooks and functionalities based on the provided actor hooks and configuration.
 *
 * Props:
 * - `hooks`: ActorHooksReturnType - The actor hooks object containing the various actor interaction hooks.
 * - `children`: React Node - The child components that will have access to the actor hooks context.
 *
 * Behavior:
 * - Validates the presence of the `hooks` object. Throws an error if it is missing, ensuring that the actor hooks are always available for actor operations.
 * - Utilizes `useMemo` to memoize the `hooks` object, optimizing for performance by avoiding unnecessary recalculations.
 * - Renders the child components once the `hooks` object is available, effectively providing them access to the actor hooks context.
 *
 * @example
 * ```jsx
 * <ActorHookProvider hooks={yourActorHooks}>
 *   <YourComponent />
 * </ActorHookProvider>
 * ```
 * This setup ensures that `YourComponent` and any of its children can interact with the specified IC actor hooks through the context provided by `ActorHookProvider`.
 */
export const ActorHookProvider = ActorHooks.ActorHookProvider
