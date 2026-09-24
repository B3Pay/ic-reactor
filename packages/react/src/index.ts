// Re-export core (following TanStack Query's pattern)
// Users can import everything from @ic-reactor/react without needing @ic-reactor/core
export * from "@ic-reactor/core"

// Re-export hooks
export * from "./hooks/index.js"

// Validation utilities for React
export * from "./validation.js"

// React-specific exports
export * from "./createActorHooks.js"
export * from "./defineReactor.js"
export * from "./defineDisplayReactor.js"
export * from "./createReactorProvider.js"

export * from "./createQuery.js"
export * from "./createSuspenseQuery.js"
export * from "./createInfiniteQuery.js"
export * from "./createSuspenseInfiniteQuery.js"
export * from "./createMutation.js"

export * from "./auth/index.js"

export * from "./types.js"

// TanStack Query's marker for a query whose args are not known yet, which the
// non-suspense query hooks and createQueryFactory take in place of args. It is
// the same symbol as @tanstack/react-query's, so either import works.
export { skipToken } from "@tanstack/react-query"
export type { SkipToken } from "@tanstack/react-query"
