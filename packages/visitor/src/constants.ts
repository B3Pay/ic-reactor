import { FunctionCategory } from "./types"

const TAMESTAMP_KEYS = [
  "time",
  "date",
  "deadline",
  "timestamp",
  "timestamp_nanos",
  "statusAt",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "validUntil",
  "status_at",
  "created_at",
  "updated_at",
  "deleted_at",
  "valid_until",
]

export const TAMESTAMP_KEYS_REGEX = new RegExp(
  // eslint-disable-next-line no-useless-escape
  TAMESTAMP_KEYS.map((key) => `^[\w-]*${key}[\w-]*$`).join("|"),
  "i"
)

const VALUE_KEYS = [
  "value",
  "amount",
  "balance",
  "price",
  "total",
  "total_supply",
  "totalSupply",
  "quantity",
]

export const VALUE_KEYS_REGEX = new RegExp(
  // eslint-disable-next-line no-useless-escape
  VALUE_KEYS.map((key) => `^[\w-]*${key}[\w-]*$`).join("|"),
  "i"
)

export const WALLET_TEST = [
  "wallet",
  "balance",
  "transfer",
  "send",
  "topup",
  "receive",
  "deposit",
  "withdraw",
  "pay",
  "claim",
  "refund",
  "reward",
  "tip",
  "buy",
  "sell",
  "purchase",
  "order",
  "checkout",
  "cart",
  "invoice",
  "payment",
  "credit",
  "debit",
  "transaction",
  "history",
  "statement",
  "account",
  "address",
  "fund",
  "staking",
  "bond",
  "unbond",
  "delegate",
  "undelegate",
  "approve",
  "allowance",
]

export const SETTING_TEST = [
  "setting",
  "version",
  "set",
  "update",
  "change",
  "modify",
  "edit",
  "remove",
  "delete",
  "add",
  "create",
  "clear",
  "reset",
  "revoke",
  "renew",
  "replace",
  "upgrade",
  "load",
  "upload",
  "downgrade",
  "install",
  "role",
  "uninstall",
  "enable",
  "disable",
  "activate",
  "deactivate",
  "suspend",
  "resume",
  "pause",
  "start",
  "stop",
  "restart",
  "refresh",
  "reload",
  "reboot",
  "shutdown",
  "terminate",
  "kill",
  "abort",
  "cancel",
]

export const STATUS_TEST = [
  "status",
  "state",
  "condition",
  "phase",
  "step",
  "stage",
  "level",
  "wasm",
  "detail",
  "info",
  "message",
  "note",
  "log",
  "bug",
  "error",
  "capacity",
  "partition",
  "timer",
]

export const GOVERNANCE_TEST = ["governance", "vote", "poll", "proposal"]

export const DEFAULT_LAYOUTS = [
  { name: "xl", size: 6 },
  { name: "md", size: 4 },
  { name: "xs", size: 2 },
] as const

export const DEFAULT_CATEGORIES: FunctionCategory[] = [
  "home",
  "wallet",
  "governance",
  "setting",
  "status",
]

export type CategoryTest = {
  name: FunctionCategory
  test: string[]
}

export const DETAULT_CATEGORY_TEST: CategoryTest[] = [
  { name: "home", test: [] },
  {
    name: "wallet",
    test: WALLET_TEST,
  },
  {
    name: "status",
    test: STATUS_TEST,
  },
  {
    name: "setting",
    test: SETTING_TEST,
  },
  { name: "governance", test: GOVERNANCE_TEST },
]
