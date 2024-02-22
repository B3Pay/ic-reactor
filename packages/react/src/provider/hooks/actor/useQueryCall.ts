import {
  FunctionName,
  UseQueryCall,
  UseQueryCallParameters,
} from "../../../types"
import { ActorHooks } from "../../actorHooks"

/**
 * Hook for making query calls to actors. It supports automatic refetching on component mount and at specified intervals.
 *
 * @param options Configuration object for the query call, including refetching options and other configurations passed to useReactorCall.
 * @returns An object containing the query call function and the current call state (data, error, loading, call, reset).
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
export function useQueryCall<A, M extends FunctionName<A> = FunctionName<A>>(
  args: UseQueryCallParameters<A, M>
) {
  return (ActorHooks.useQueryCall as UseQueryCall<A>)(args)
}
