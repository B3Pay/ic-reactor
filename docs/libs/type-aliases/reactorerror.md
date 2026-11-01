---
title: ReactorError
editUrl: false
next: true
prev: true
---

> **ReactorError**\<`E`\> = \[`E`\] *extends* \[`never`\] ? `ReactorErrorBase` & `object` : `ReactorErrorBase` & \{ `kind`: `Exclude`\<[`ReactorErrorKind`](/docs/ic-reactor/libs/type-aliases/reactorerrorkind/), `"canister_err"`\>; `err?`: `undefined`; \} \| \{ `kind`: `"canister_err"`; `err`: `E`; \}

Defined in: [core/src/errors.ts:134](https://github.com/B3Pay/ic-reactor/blob/7c822a725a135ee579b83982997d6233fd39e3e7/packages/core/src/errors.ts#L134)

The error every ic-reactor call rejects with.

Narrow on `kind`. For a method whose result has an `Err` arm, `E` is that
arm's type, and `err` is typed `E` exactly when `kind` is `"canister_err"`
(and `undefined` for every other kind). `E` defaults to `never`, which
stands for a method without an `Err` arm: `err` is then always `undefined`.

## Type Parameters

### E

`E` = `never`

## Example

```ts
try {
  await ledger.icrc1_transfer(args)
} catch (e) {
  if (isReactorError(e) && e.mayHaveExecuted) {
    // Do not re-send: read the balance back first.
  }
}
```
