// ============================================================================
// Hooks
// ============================================================================

// useActorQuery / useReactorQuery
export { useActorQuery as useReactorQuery } from "./useActorQuery.js"

// useActorMutation / useReactorMutation
export { useActorMutation as useReactorMutation } from "./useActorMutation.js"

// useActorSuspenseQuery / useReactorSuspenseQuery
export { useActorSuspenseQuery as useReactorSuspenseQuery } from "./useActorSuspenseQuery.js"

// useActorInfiniteQuery / useReactorInfiniteQuery
export { useActorInfiniteQuery as useReactorInfiniteQuery } from "./useActorInfiniteQuery.js"

// useActorSuspenseInfiniteQuery / useReactorSuspenseInfiniteQuery
export { useActorSuspenseInfiniteQuery as useReactorSuspenseInfiniteQuery } from "./useActorSuspenseInfiniteQuery.js"

// useActorMethod / useReactorMethod
export {
  useActorMethod,
  useActorMethod as useReactorMethod,
  createActorMethodHooks,
} from "./useActorMethod.js"

// ============================================================================
// Types - UseReactor* (with reactor parameter)
// ============================================================================

export type {
  UseActorQueryParameters as UseReactorQueryParameters,
  UseActorQueryResult as UseReactorQueryResult,
} from "./useActorQuery.js"

export type {
  UseActorMutationParameters as UseReactorMutationParameters,
  UseActorMutationResult as UseReactorMutationResult,
} from "./useActorMutation.js"

export type {
  UseActorSuspenseQueryParameters as UseReactorSuspenseQueryParameters,
  UseActorSuspenseQueryResult as UseReactorSuspenseQueryResult,
} from "./useActorSuspenseQuery.js"

export type {
  UseActorInfiniteQueryParameters as UseReactorInfiniteQueryParameters,
  UseActorInfiniteQueryResult as UseReactorInfiniteQueryResult,
} from "./useActorInfiniteQuery.js"

export type {
  UseActorSuspenseInfiniteQueryParameters as UseReactorSuspenseInfiniteQueryParameters,
  UseActorSuspenseInfiniteQueryResult as UseReactorSuspenseInfiniteQueryResult,
} from "./useActorSuspenseInfiniteQuery.js"

export type {
  UseActorMethodParameters as UseReactorMethodParameters,
  UseActorMethodResult as UseReactorMethodResult,
} from "./useActorMethod.js"

// ============================================================================
// Types - UseActor* (without reactor parameter, for use with createActorHooks)
// ============================================================================

export type {
  UseActorQueryConfig as UseActorQueryParameters,
  UseActorQueryResult,
} from "./useActorQuery.js"

export type {
  UseActorMutationConfig as UseActorMutationParameters,
  UseActorMutationResult,
} from "./useActorMutation.js"

export type {
  UseActorSuspenseQueryConfig as UseActorSuspenseQueryParameters,
  UseActorSuspenseQueryResult,
} from "./useActorSuspenseQuery.js"

export type {
  UseActorInfiniteQueryConfig as UseActorInfiniteQueryParameters,
  UseActorInfiniteQueryResult,
} from "./useActorInfiniteQuery.js"

export type {
  UseActorSuspenseInfiniteQueryConfig as UseActorSuspenseInfiniteQueryParameters,
  UseActorSuspenseInfiniteQueryResult,
} from "./useActorSuspenseInfiniteQuery.js"

// Note: UseActorMethodParameters for the Method hook is the same as UseReactorMethodParameters
// since it requires a reactor. Use Omit<UseReactorMethodParameters<...>, "reactor"> if needed.
export type { UseActorMethodResult } from "./useActorMethod.js"
