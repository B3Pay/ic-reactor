---
title: parseUnits
editUrl: false
next: true
prev: true
---

> **parseUnits**(`text`, `decimals`, `options?`): `bigint`

Defined in: [core/src/units.ts:150](https://github.com/B3Pay/ic-reactor/blob/189aba57cfa0e99738cd0bfc7e05c28c8ff94a26/packages/core/src/units.ts#L150)

Read a decimal amount a person typed, such as `"1.5"`, as the token's base
units, exactly.

The text is digits with at most one `.`; whitespace around it is ignored,
and `"5."` and `".5"` are accepted. Anything else is refused rather than
guessed at: grouping separators (`"1,5"` means 1.5 in one locale and 15 in
another), exponents (`"1e-8"`), a leading `+`, a lone `.`, whitespace
inside the number, and any other character. More fraction digits than
`decimals` are refused too, unless the extra ones are all zeros: 0.1 at
8 decimals is `10000000n`, but `"0.123456789"` is no amount of e8s, and
rounding it would send something other than what was typed.

There is no upper bound on the result. A `nat64` field in a generated
module refuses 2^64 when the call is encoded, before anything is sent, and
an ICRC-1 `amount` is a `nat`, which has no bound; the limit belongs to the
Candid type, not to the conversion.

## Parameters

### text

`string`

The decimal amount, as a person types it.

### decimals

`number`

The token's decimals, a whole number from 0 to 255, as
`icrc1_decimals` returns them.

### options?

`signed: true` accepts a leading `-`, for an `int` amount.
It defaults to `false`: a ledger's amounts are `nat`, so a negative amount
is refused here instead of failing later when the call is encoded. No other
key is accepted.

#### signed?

`boolean`

## Returns

`bigint`

The amount in base units: `150000000n` for `"1.5"` at 8 decimals.

## Throws

TypeError when `text` is not text or not a decimal amount (blank,
letters, grouping, an exponent, a `+`, a lone `.`, inner whitespace),
`decimals` is not a whole number, or `options` is not an object, has a key
other than `signed`, or a `signed` that is not a boolean.

## Throws

RangeError when `text` has more significant fraction digits than
`decimals`, is negative without `signed`, or `decimals` is outside 0-255.

## Example

```ts
import { parseUnits } from "@ic-reactor/core"

parseUnits("0.29", 8) // 29000000n (Number math gives 28999999)
parseUnits("1.1", 18) // 1100000000000000000n
parseUnits("1.000000000", 8) // 100000000n: the extra zeros change nothing
parseUnits("0.123456789", 8) // throws RangeError: 9 fraction digits
parseUnits("-1", 8) // throws RangeError: negative
parseUnits("-1", 8, { signed: true }) // -100000000n
parseUnits("1e3", 8) // throws TypeError: no exponents

// In a form: show the message and send nothing, or send the exact amount
const onSubmit = () => {
  let amount: bigint
  try {
    amount = parseUnits(input, decimals)
  } catch (error) {
    setAmountError((error as Error).message)
    return
  }
  transfer({ to: { owner }, amount })
}
```
