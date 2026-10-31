---
title: isReactorError
editUrl: false
next: true
prev: true
---

## Call Signature

> **isReactorError**\<`A`, `M`\>(`error`, `canister`, `method`): `error is ReactorError<ErrorOf<A, M>> & { method: M }`

Defined in: [core/src/errors.ts:199](https://github.com/B3Pay/ic-reactor/blob/cd4c701ce278affefc56cd7128634e1ec9d35897/packages/core/src/errors.ts#L199)

Whether `error` is a [ReactorError](/docs/ic-reactor/libs/type-aliases/reactorerror/) that a call of `method` on
`canister` rejected with. Narrows to `ReactorError<E>`, where `E` is the
method's `Err` arm, and whose `method` is `method`: after a check on
`kind === "canister_err"`, `err` is typed. For a method without an `Err`
arm, `err` is `undefined`. When it is `false`, the error is only not that
call's: it keeps every `kind`.

The check is made at run time, not only in the types: it is `false` for an
error from another method, from another canister object (the one made with
`certified: true` is another object, and so is a canister of another
client), and from a func reference, so it never narrows an error to the
wrong `Err` type. `client.canister()` returns the same object for the same
generated module and target, so the canister can be made again where the
error is caught.

### Type Parameters

#### A

`A`

#### M

`M` *extends* `string`

### Parameters

#### error

`unknown`

#### canister

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

#### method

`M`

### Returns

`error is ReactorError<ErrorOf<A, M>> & { method: M }`

### Example

```ts
try {
  await ledger.icrc1_transfer(arg)
} catch (error) {
  if (isReactorError(error, ledger, "icrc1_transfer") && error.kind === "canister_err") {
    error.err // the ledger's TransferError
  }
}
```

## Call Signature

> **isReactorError**(`error`): error is Error & (\{ readonly name: "ReactorError"; readonly mayHaveExecuted: boolean; readonly method: string; readonly canisterId: string; readonly code?: string \| undefined; readonly rejectCode?: number \| undefined; readonly httpStatus?: number \| undefined; readonly issues?: readonly \{ ...; \}\[\] \| undefined; readonly cause?: unknown...)

Defined in: [core/src/errors.ts:212](https://github.com/B3Pay/ic-reactor/blob/cd4c701ce278affefc56cd7128634e1ec9d35897/packages/core/src/errors.ts#L212)

Whether `error` is a [ReactorError](/docs/ic-reactor/libs/type-aliases/reactorerror/), including one created by another
copy of this package. Narrows to `ReactorError<unknown>`: after a check on
`kind === "canister_err"`, `err` is `unknown`. It can be passed point-free,
as in `errors.filter(isReactorError)`: the index and the array an array
method passes are not a canister and a method. This signature is listed
after the three-argument one so that point-free use infers it.

### Parameters

#### error

`unknown`

### Returns

error is Error & (\{ readonly name: "ReactorError"; readonly mayHaveExecuted: boolean; readonly method: string; readonly canisterId: string; readonly code?: string \| undefined; readonly rejectCode?: number \| undefined; readonly httpStatus?: number \| undefined; readonly issues?: readonly \{ ...; \}\[\] \| undefined; readonly cause?: unknown...)
