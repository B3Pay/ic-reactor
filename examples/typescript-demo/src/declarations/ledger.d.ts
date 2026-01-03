import type { IDL } from "@icp-sdk/core/candid"

export const ledgerIdlFactory: IDL.InterfaceFactory
export const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const ledgerCanisterId: string
