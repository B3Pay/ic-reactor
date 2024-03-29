import { ActorHooks } from "../hooks/actor/hooks"

/**
 * `ActorProvider` is a React functional component that serves as a context provider for IC actor interactions within a React application.
 * It wraps child components, providing them access to actor-specific hooks and functionalities based on the provided canister ID and configuration.
 *
 * Props:
 * - `children`: React Node - The child components that will have access to the actor context.
 * - `canisterId` (optional): string - The Canister ID for actor interactions. If not provided, the default from `createActorContext` is used.
 * - `loadingComponent` (optional): React Node - A component displayed during the loading/fetching state. Defaults to a simple message.
 * - `...restConfig`: Additional configuration options that will be merged with the default configuration provided during context creation.
 *
 * Behavior:
 * - Validates the presence of a `canisterId`. Throws an error if it is missing, ensuring that a valid canister ID is always used for actor operations.
 * - Utilizes `useMemo` to combine the default configuration with the props provided to the `ActorProvider`, optimizing for performance by avoiding unnecessary recalculations.
 * - Employs the `useActor` hook to initiate actor interactions based on the combined configuration, managing states such as `fetching`, `fetchError`, and the actor `hooks`.
 * - Conditionally renders the `loadingComponent` or `fetchError` based on the actor fetching state. Once the actor is ready and no errors are present, it renders the child components, effectively providing them access to the actor context.
 *
 * @example
 * ```jsx
 * <ActorProvider canisterId="your-canister-id">
 *   <YourComponent />
 * </ActorProvider>
 * ```
 * This setup ensures that `YourComponent` and any of its children can interact with the specified IC actor through the context provided by `ActorProvider`.
 */
export const ActorProvider = ActorHooks.ActorProvider
