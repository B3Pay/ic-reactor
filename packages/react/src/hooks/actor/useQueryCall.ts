import ActorHooks from "./hooks"

import {
  BaseActor,
  FunctionName,
  UseQueryCall,
  UseQueryCallParameters,
  UseSharedCallReturnType,
} from "../../types"

/**
 * Hook for making query calls to actors. It supports automatic refetching on component mount and at specified intervals.
 *
 * @param args {@link UseQueryCallParameters}.
 * @returns object {@link UseSharedCallReturnType}.
 * @example
 * ```tsx
 * function QueryCallComponent() {
 *    const { call, data, loading } = useQueryCall({
 *      functionName: 'getUserProfile',
 *      args: ['123'],
 *      refetchOnMount: true,
 *      refetchInterval: 5000, // refetch every 5 seconds
 *    });
 *
 *    if (loading) return <p>Loading profile...</p>;
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
>(args: UseQueryCallParameters<A, M>): UseSharedCallReturnType<A, M> {
  return (ActorHooks.useQueryCall as UseQueryCall<A>)(args)
}
