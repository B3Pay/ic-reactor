import ActorHooks from "./hooks"

import type {
  BaseActor,
  FunctionName,
  UseUpdateCall,
  UseUpdateCallParameters,
  UseSharedCallReturnType,
} from "../../types"

/**
 * Hook for making update calls to actors, handling loading states, and managing errors. It supports custom event handlers for loading, success, and error events.
 *
 * @param args {@link UseUpdateCallParameters}.
 * @returns object {@link UseSharedCallReturnType}.
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
>(args: UseUpdateCallParameters<A, M>): UseSharedCallReturnType<A, M> {
  return (ActorHooks.useUpdateCall as UseUpdateCall<A>)(args)
}
