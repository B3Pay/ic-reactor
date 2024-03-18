const TAMESTAMP_KEYS = [
  "date",
  "deadline",
  "timestamp",
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
