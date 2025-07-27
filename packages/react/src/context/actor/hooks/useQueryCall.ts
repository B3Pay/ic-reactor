import { ActorHooks } from ".."

import type {
  BaseActor,
  FunctionName,
  UseQueryCall,
  UseQueryCallParameters,
  UseQueryCallReturnType,
} from "../../../types"

/**
 * Hook for making query calls to actors. It supports automatic refetching on component mount and at specified intervals.
 *
 * @param args {@link UseQueryCallParameters}.
 * @returns object {@link UseQueryCallReturnType}.
 * @example
 * ```tsx
 * function QueryCallComponent() {
 *    const { call, data, isLoading } = useQueryCall({
 *      functionName: 'getUserProfile',
 *      args: ['123'],
 *      refetchOnMount: true,
 *      refetchInterval: 5000, // refetch every 5 seconds
 *    });
 *
 *    if (isLoading) return <p>isLoading profile...</p>;
 *
 *    return (
 *      <div>
 *        <p>User Profile: {JSON.stringify(data)}</p>
 *        <button onClick={call}>Refetch</button>
 *      </div>
 *    );
 * }
 * ```
 */
export function useQueryCall<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>
>(args: UseQueryCallParameters<A, M>): UseQueryCallReturnType<A, M> {
  return (ActorHooks.useQueryCall as UseQueryCall<A>)(args)
}
