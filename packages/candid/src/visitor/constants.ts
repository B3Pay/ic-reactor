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

const EMAIL_KEYS_REGEX = /email|mail/i
const PHONE_KEYS_REGEX = /phone|tel|mobile/i
const URL_KEYS_REGEX = /url|link|website/i
const UUID_KEYS_REGEX = /uuid|guid/i
const BITCOIN_KEYS_REGEX = /bitcoin|btc/i
const ETHEREUM_KEYS_REGEX = /ethereum|eth/i
const ACCOUNT_ID_KEYS_REGEX =
  /account_id|account_identifier|ledger_account|block_hash|transaction_hash|tx_hash/i
const PRINCIPAL_KEYS_REGEX = /canister|principal/i

export const checkTextFormat = (label?: string): TextFormat => {
  if (!label) return "plain"
  if (TAMESTAMP_KEYS_REGEX.test(label)) return "timestamp"
  if (EMAIL_KEYS_REGEX.test(label)) return "email"
  if (PHONE_KEYS_REGEX.test(label)) return "phone"
  if (URL_KEYS_REGEX.test(label)) return "url"
  if (UUID_KEYS_REGEX.test(label)) return "uuid"
  if (BITCOIN_KEYS_REGEX.test(label)) return "btc"
  if (ETHEREUM_KEYS_REGEX.test(label)) return "eth"
  if (ACCOUNT_ID_KEYS_REGEX.test(label)) return "account-id"
  if (PRINCIPAL_KEYS_REGEX.test(label)) return "principal"
  return "plain"
}

export const checkNumberFormat = (label?: string): NumberFormat => {
  if (!label) return "normal"
  if (TAMESTAMP_KEYS_REGEX.test(label)) return "timestamp"
  if (CYCLE_KEYS_REGEX.test(label)) return "cycle"
  return "normal"
}
