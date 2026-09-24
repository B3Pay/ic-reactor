/**
 * Hook barrel exports
 *
 * Hand-maintained, not codegen output. Codegen's `factories: true` generates
 * the createQuery, createQueryFactory and createMutation kinds for every
 * method (see examples/codegen-in-action), but not the suspense ones used here.
 */
export * from "./icrc1NameQuery"
export * from "./icrc1SymbolQuery"
export * from "./icrc1BalanceOfSuspenseQuery"
export * from "./icrc1TransferMutation"
export * from "./icrc1DecimalsSuspenseQuery"
