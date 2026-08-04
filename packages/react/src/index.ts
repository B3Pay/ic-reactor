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

export * from "./createQuery.js"
export * from "./createSuspenseQuery.js"
export * from "./createInfiniteQuery.js"
export * from "./createSuspenseInfiniteQuery.js"
export * from "./createMutation.js"

export * from "./auth/index.js"

export * from "./types.js"
