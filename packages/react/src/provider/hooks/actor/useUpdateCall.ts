import {
  BaseActor,
  FunctionName,
  UseUpdateCall,
  UseUpdateCallParameters,
} from "../../../types"
import { ActorHooks } from "../../actorHooks"

/**
 * Hook for making update calls to actors, handling loading states, and managing errors. It supports custom event handlers for loading, success, and error events.
 *
 * @param options Configuration object for the actor method call, including the method name, arguments, and event handlers.
 * @returns An object containing the method call function, a reset function to reset the call state to its default, and the current call state (data, error, loading, call, reset).
 * @example
 * ```tsx
 * function UpdateCallComponent() {
 *   const { call, data, loading } = useUpdateCall({
 *      functionName: 'updateUserProfile',
 *      args: ['123', { name: 'John Doe' }],
 *      onLoading: (loading) => console.log('Loading:', loading),
 *      onError: (error) => console.error('Error:', error),
 *      onSuccess: (data) => console.log('Success:', data),
 *   });
 *
 *  if (loading) return <p>Updating profile...</p>;
 *
 *  return (
 *    <div>
 *      <p>Updated Profile: {JSON.stringify(data)}</p>
 *      <button onClick={call}>Update</button>
 *    </div>
 *  );
 * }
 * ```
 */
export function useUpdateCall<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>
>(args: UseUpdateCallParameters<A, M>) {
  return (ActorHooks.useUpdateCall as UseUpdateCall<A>)(args)
}
