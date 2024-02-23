import { createReactorStore } from "@ic-reactor/core"
import { agentHooks, authHooks, actorHooks } from "./helpers"

import type {
  BaseActor,
  CreateReactorParameters,
  CreateReactorReturnType,
} from "./types"

/**
 * Initializes and configures the reactor environment for interacting with the Internet Computer (IC) blockchain within a React application.
 * It encapsulates the creation of actors, authentication, and agent management, offering a streamlined interface for blockchain interactions.
 *
 * @param config Configuration config for the reactor, including:
 *  - `withProcessEnv` (optional): Specifies whether to use process environment variables to determine if the environment is local or development. Defaults to false.
 *  - `isLocalEnv` (optional): Indicates if the current environment is local or development, influencing the agent and actor behavior. Useful for testing or development.
 *  - `port` (optional): Port number for the local or development environment.
 *  Extends `CreateReactorStoreParameters` which includes HTTP agent config, actor manager config (excluding `agentManager`), and an optional custom agent manager.
 *
 * @returns An object containing various hooks and utilities:
 *  - {@link getAgent} - Returns the current agent instance.
 *  - {@link getVisitFunction} - Returns the visit function for the actor.
 *  - {@link useQueryCall} - A hook for querying actor methods.
 *  - {@link useUpdateCall} - A hook for updating actor methods.
 *  - {@link useAuth} - A hook for managing authentication and user principal.
 *  - {@link useActor} - A hook for managing actors and their methods.
 *  - {@link useActorManager} - A hook for managing actor manager and its methods.
 *  - {@link useAgentManager} - A hook for managing agent manager and its methods.
 *  - {@link initialize} - A function to initialize the actor manager if not initialized.
 *  - {@link useActorState} - A hook for managing actor state.
 *  - {@link useAgent} - A hook for managing agent and its methods.
 *  - {@link useAuthState} - A hook for managing authentication state.
 *  - {@link useAgentState} - A hook for managing agent state.
 *  - {@link useUserPrincipal} - A hook for managing user principal.
 *  - {@link useVisitMethod} - A hook for visiting actor methods.
 *
 * @example
 * ```typescript
 * import { createReactor } from "@ic-reactor/react";
 * import type { CreateReactorParameters } from "@ic-reactor/react/dist/types";
 * import { canisterId, idlFactory, yourActor } from "./declaration/yourActor"
 *
 * const config: CreateReactorParameters = {
 *   canisterId,
 *   idlFactory,
 *   host: "https://localhost:8000", // IC network host         |
 *   isLocalEnv: true, // Set true for local network            | one of these
 *   withProcessEnv: true, // Use process.env to determine host |
 *   port: 8000, // Port number for local network               |
 * };
 *
 * export type YourActor = typeof yourActor;
 *
 * export const { useAuth, useQueryCall, useUpdateCall } = createReactor<YourActor>(config);
 * // Now you can use the returned hooks in your React components
 * ```
 */
export const createReactor = <A = BaseActor>(
  config: CreateReactorParameters
): CreateReactorReturnType<A> => {
  const actorManager = createReactorStore<A>(config)

  const getVisitFunction = () => {
    return actorManager.visitFunction
  }

  const getAgent = () => {
    return actorManager.agentManager.getAgent()
  }

  return {
    getAgent,
    getVisitFunction,
    ...actorHooks(actorManager),
    ...authHooks(actorManager.agentManager),
    ...agentHooks(actorManager.agentManager),
  }
}
