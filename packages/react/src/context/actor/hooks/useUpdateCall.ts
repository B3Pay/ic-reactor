import { ActorHooks } from ".."

import type {
  BaseActor,
  FunctionName,
  UseUpdateCall,
  UseUpdateCallParameters,
  UseUpdateCallReturnType,
} from "../../../types"

/**
 * Hook for making update calls to actors, handling loading states, and managing errors. It supports custom event handlers for loading, success, and error events.
 *
 * @param args {@link UseUpdateCallParameters}.
 * @returns object {@link UseUpdateCallReturnType}.
 * @example
 * ```tsx
 * function UpdateCallComponent() {
 *   const { call, data, isLoading } = useUpdateCall({
 *      functionName: 'updateUserProfile',
 *      args: ['123', { name: 'John Doe' }],
 *      onLoading: (isLoading) => console.log('Loading:', isLoading),
 *      onError: (error) => console.error('Error:', error),
 *      onSuccess: (data) => console.log('Success:', data),
 *   });
 *
 *  if (isLoading) return <p>Updating profile...</p>;
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
>(args: UseUpdateCallParameters<A, M>): UseUpdateCallReturnType<A, M> {
  return (ActorHooks.useUpdateCall as UseUpdateCall<A>)(args)
}
