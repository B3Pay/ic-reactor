import {
  BaseActor,
  FunctionName,
  UseMethod,
  UseMethodParameters,
  UseMethodReturnType,
} from "../../types"
import ActorHooks from "./hooks"

/**
 * Hook for making dynamically update or query calls to actors, handling loading states, and managing errors. It supports custom event handlers for loading, success, and error events.
 *
 * @param args {@link UseMethodParameters}.
 * @returns object {@link UseMethodReturnType}.
 * @example
 * ```tsx
 * function MethodCallComponent() {
 *   const { call, data, loading } = useMethod({
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
export function useMethod<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>
>(args: UseMethodParameters<A, M>): UseMethodReturnType<A, M> {
  return (ActorHooks.useMethod as UseMethod<A>)(args)
}
