export const formatBalance = (bal: bigint | string | undefined) => {
  if (bal === undefined) return "—"
  const balance = BigInt(bal)
  const decimals = 8
  const factor = BigInt(10 ** decimals)
  const integerPart = balance / factor
  const fractionalPart = balance % factor
  const fractionalString = fractionalPart.toString().padStart(decimals, "0")
  // Trim trailing zeros from fractional part
  const trimmedFractional = fractionalString.replace(/0+$/, "")
  return trimmedFractional.length > 0
    ? `${integerPart}.${trimmedFractional}`
    : `${integerPart}`
}
