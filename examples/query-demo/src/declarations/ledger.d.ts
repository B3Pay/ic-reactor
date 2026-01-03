import type { IDL } from "@icp-sdk/core/candid"
import type { Ledger } from "./ledger.type"

export const ledgerIdlFactory: IDL.InterfaceFactory
export const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const ledgerCanisterId: string
export type { Ledger }
