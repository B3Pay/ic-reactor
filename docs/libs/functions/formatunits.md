---
title: formatUnits
editUrl: false
next: true
prev: true
---

> **formatUnits**(`value`, `decimals`, `options?`): `string`

Defined in: [core/src/units.ts:254](https://github.com/B3Pay/ic-reactor/blob/7c822a725a135ee579b83982997d6233fd39e3e7/packages/core/src/units.ts#L254)

Show an amount of a token's base units as plain decimal text, exactly.

`value` is what a ledger returns, a `bigint`; no digit passes through a
JavaScript `Number`, so an 18-decimal balance of any size shows as it is.
The text is only `-`, the digits 0-9 and `.`, the same on the server and in
every browser, and the form [parseUnits](/docs/ic-reactor/libs/functions/parseunits/) reads back. For a locale's
separators or grouping, format that text yourself. `Intl.NumberFormat` reads
a decimal string exactly (an engine without Intl.NumberFormat v3 turns it
into a `Number` first), but it rounds to 3 fraction digits unless told
otherwise, so `"0.99999999"` would show as `"1"`: the overstatement
`maxFractionDigits` below prevents. Give it a `maximumFractionDigits` of at
least the digits the text has (`decimals` does, up to the 100 Intl allows),
and a `minimumFractionDigits` to keep zeros `minFractionDigits` padded.

By default every significant fraction digit is shown and zeros at the end
are dropped, so one ICP (100000000n at 8 decimals) is `"1"`.
`maxFractionDigits` shortens the fraction by cutting the digits past it,
toward zero and never rounding, so a balance of 0.99999999 shown to two
digits is `"0.99"`: never more than is held. `minFractionDigits` pads the
fraction with zeros instead of trimming them, so `2` shows one ICP as
`"1.00"`. A negative amount (an `int`) is written with a leading `-`,
except where the digits shown are all zero: there is no `"-0"`.

`maxFractionDigits` beyond `decimals` shows the amount exactly, as the
default does, so one display setting can serve tokens of different
decimals. `minFractionDigits` may pad past `decimals`: `"1.2500"` at 2
decimals is the same amount, and [parseUnits](/docs/ic-reactor/libs/functions/parseunits/) reads it back.

There is no upper bound on `value`. A `nat64` field in a generated module
refuses 2^64 when the call is encoded; an ICRC-1 `nat` has no bound.

## Parameters

### value

`bigint`

The amount in base units (e8s for ICP).

### decimals

`number`

The token's decimals, a whole number from 0 to 255, as
`icrc1_decimals` returns them.

### options?

`maxFractionDigits` (default `decimals`, or
`minFractionDigits` when that is more) and `minFractionDigits` (default
`0`), each a whole number from 0 to 255 with `minFractionDigits` not more
than `maxFractionDigits`. Any other key, such as Intl's
`maximumFractionDigits`, is refused.

#### maxFractionDigits?

`number`

#### minFractionDigits?

`number`

## Returns

`string`

The amount as decimal text, `"1.5"` for 150000000n at 8 decimals.

## Throws

TypeError when `value` is not a `bigint`, `decimals` or a digit
option is not a whole number, or `options` is not an object or has another
key.

## Throws

RangeError when `decimals` or a digit option is outside 0-255, or
`minFractionDigits` is more than `maxFractionDigits`.

## Example

```ts
import { formatUnits } from "@ic-reactor/core"

formatUnits(150_000_000n, 8) // "1.5"
formatUnits(123_456_789n, 8, { maxFractionDigits: 2 }) // "1.23"
formatUnits(99_999_999n, 8, { maxFractionDigits: 2 }) // "0.99", never "1"
formatUnits(100_000_000n, 8, { minFractionDigits: 2 }) // "1.00"
formatUnits(-1n, 8) // "-0.00000001"

// A locale's separators are the app's to add, over the plain text.
// maximumFractionDigits stops Intl rounding to its default 3 digits.
// The cast is for lib ES2023 or later (es2023.intl): before it, the Intl
// types accept a number or bigint only, and a number loses digits.
const text = formatUnits(123_456_789_000n, 8) // "1234.56789"
new Intl.NumberFormat("de-DE", { maximumFractionDigits: 8 }).format(
  text as Intl.StringNumericLiteral
) // "1.234,56789"
```
