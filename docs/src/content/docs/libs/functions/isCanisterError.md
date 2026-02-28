---
title: isCanisterError
editUrl: false
next: true
prev: true
---

## Call Signature

> **isCanisterError**\<`E`\>(`error`): `error is CanisterError<E>`

Defined in: [errors/index.ts:152](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/errors/index.ts#L152)

Type guard to check if an error is a CanisterError.
Preserves the generic type E from the input when used in type narrowing.

### Type Parameters

#### E

`E`

### Parameters

#### error

[`CallError`](../classes/CallError.md) | [`CanisterError`](../classes/CanisterError.md)\<`E`\>

### Returns

`error is CanisterError<E>`

### Example

```typescript
// err is typed as CanisterError<TransferError> | CallError
if (isCanisterError(err)) {
  // err.err is typed as TransferError (preserved!)
  console.log(err.err)
}
```

## Call Signature

> **isCanisterError**(`error`): `error is CanisterError<unknown>`

Defined in: [errors/index.ts:155](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/errors/index.ts#L155)

Type guard to check if an error is a CanisterError.
Preserves the generic type E from the input when used in type narrowing.

### Parameters

#### error

`unknown`

### Returns

`error is CanisterError<unknown>`

### Example

```typescript
// err is typed as CanisterError<TransferError> | CallError
if (isCanisterError(err)) {
  // err.err is typed as TransferError (preserved!)
  console.log(err.err)
}
```
