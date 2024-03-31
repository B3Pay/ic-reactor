import { ActorHooks } from "./hooks"

/**
 * Hook for making dynamically update or query calls to actors, handling loading states, and managing errors. It supports custom event handlers for loading, success, and error events.
 *
 * @param options Configuration object for the actor method call, including the method name, arguments, and event handlers.
 * @returns An object containing the method call function, a reset function to reset the call state to its default, and the current call state (data, error, loading, call, reset).
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
export const useMethod = ActorHooks.useMethod
