import type { TextFormat, NumberFormat } from "./returns/types"

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

const TAMESTAMP_KEYS_REGEX = new RegExp(
  TAMESTAMP_KEYS.map((key) => `^[\\w-]*${key}[\\w-]*$`).join("|"),
  "i"
)

const CYCLE_KEYS = ["cycle", "cycles"]

const CYCLE_KEYS_REGEX = new RegExp(
  CYCLE_KEYS.map((key) => `^[\\w-]*${key}[\\w-]*$`).join("|"),
  "i"
)

const ACCOUNT_ID_KEYS_REGEX =
  /account_identifier|ledger_account|block_hash|transaction_hash|tx_hash/i

const tokenize = (label: string): Set<string> => {
  const parts = label
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[\s-]+/)
  return new Set(parts)
}

export const checkTextFormat = (label?: string): TextFormat => {
  if (!label) return "plain"

  if (TAMESTAMP_KEYS_REGEX.test(label)) return "timestamp"
  if (ACCOUNT_ID_KEYS_REGEX.test(label)) return "account-id"

  const tokens = tokenize(label)

  if (tokens.has("email") || tokens.has("mail")) return "email"
  if (tokens.has("phone") || tokens.has("tel") || tokens.has("mobile"))
    return "phone"
  if (tokens.has("url") || tokens.has("link") || tokens.has("website"))
    return "url"
  if (tokens.has("uuid") || tokens.has("guid")) return "uuid"
  if (tokens.has("btc") || tokens.has("bitcoin")) return "btc"
  if (tokens.has("eth") || tokens.has("ethereum")) return "eth"
  if (tokens.has("principal") || tokens.has("canister")) return "principal"

  return "plain"
}

export const checkNumberFormat = (label?: string): NumberFormat => {
  if (!label) return "normal"
  if (TAMESTAMP_KEYS_REGEX.test(label)) return "timestamp"
  if (CYCLE_KEYS_REGEX.test(label)) return "cycle"
  return "normal"
}
