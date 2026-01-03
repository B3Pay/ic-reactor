// Re-export core (following TanStack Query's pattern)
// Users can import everything from @ic-reactor/react without needing @ic-reactor/core
export * from "@ic-reactor/core"

// Re-export hooks
export * from "./hooks"

// Validation utilities for React
export * from "./validation"

// React-specific exports
export * from "./createAuthHooks"
export * from "./createActorHooks"

export * from "./createQuery"
export * from "./createSuspenseQuery"
export * from "./createInfiniteQuery"
export * from "./createSuspenseInfiniteQuery"
export * from "./createMutation"

export * from "./types"
