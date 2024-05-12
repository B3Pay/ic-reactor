export const generateNumber = (isSigned: boolean): number => {
  const num = Math.floor(Math.random() * 100)
  if (isSigned && Math.random() < 0.5) {
    return -num
  } else {
    return num
  }
}

export const generateBigInteger = (bits: number, isSigned: boolean): bigint => {
  // Define a maximum value to limit the BigInt size more strictly.
  const smallMax = BigInt(99999999) // This could be adjusted as needed.

  let randomBigInt = BigInt(0)
  const byteCount = Math.ceil(bits / 8)
  const randomBytes = generateRandomBytes(byteCount)

  // Convert the bytes to a BigInt and apply a mask
  randomBigInt = BigInt(
    "0x" +
      Array.from(randomBytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
  )

  const mask = (BigInt(1) << BigInt(bits)) - BigInt(1)
  randomBigInt = randomBigInt & mask

  // Apply the smaller max limit
  randomBigInt = randomBigInt % smallMax

  if (isSigned && randomBigInt > smallMax / BigInt(2)) {
    randomBigInt -= smallMax
  }

  return randomBigInt
}

export const generateRandomBytes = (n: number): Uint8Array => {
  const arr = new Uint8Array(n)
  // Reducing the random range to generate smaller numbers consistently.
  for (let i = 0; i < n; i++) {
    arr[i] = Math.floor(Math.random() * 16) // Only using lower 4 bits.
  }
  return arr
}
