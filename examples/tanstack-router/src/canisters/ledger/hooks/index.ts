/**
 * Hook barrel exports
 *
 * Hand-maintained, because this example writes its reactor by hand. In a
 * project whose reactor codegen generates, `factories: true` generates the
 * non-suspense modules here under the same names (see
 * examples/codegen-in-action), but no suspense factories.
 */
export * from "./icrc1NameQuery"
export * from "./icrc1SymbolQuery"
export * from "./icrc1BalanceOfSuspenseQuery"
export * from "./icrc1TransferMutation"
export * from "./icrc1DecimalsSuspenseQuery"
