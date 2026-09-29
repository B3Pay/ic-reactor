// `./declarations/ledger` of the ledger demos: the default app's ICRC-1 ledger
// declarations, plus the names the codec demo and the typescript demo generate
// them under: `Ledger` for the service type and `ledgerIdlFactory`.
import type { IDL } from "@icp-sdk/core/candid"

export * from "../../../app/declarations/ledger"
export type { _SERVICE as Ledger } from "../../../app/declarations/ledger"

export declare const ledgerIdlFactory: IDL.InterfaceFactory
