import type { LedgerTool, LedgerToolConfig } from "./contract"

export type { LedgerTool, LedgerToolConfig, TransferResult } from "./contract"

export function createLedgerTool(_config: LedgerToolConfig): LedgerTool {
  throw new Error("TODO: implement createLedgerTool")
}
