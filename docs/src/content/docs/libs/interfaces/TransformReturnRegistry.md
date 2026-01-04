---
title: TransformReturnRegistry
editUrl: false
next: true
prev: true
---

Defined in: [types/reactor.ts:104](https://github.com/B3Pay/ic-reactor/blob/7036734963f96dc0d6af031acb9e17758f8a7cd1/packages/core/src/types/reactor.ts#L104)

Registry for return type transformations.
Users can augment this interface to add custom transforms:

## Example

```typescript
declare module "@ic-reactor/core" {
  interface TransformReturnRegistry<T> {
    myCustom: MyCustomReturnTransform<T>
  }
}
```

## Type Parameters

### T

`T`

## Properties

### candid

> **candid**: `T`

Defined in: [types/reactor.ts:105](https://github.com/B3Pay/ic-reactor/blob/7036734963f96dc0d6af031acb9e17758f8a7cd1/packages/core/src/types/reactor.ts#L105)

---

### display

> **display**: [`DisplayOf`](../type-aliases/DisplayOf.md)\<`T`\>

Defined in: [types/reactor.ts:106](https://github.com/B3Pay/ic-reactor/blob/7036734963f96dc0d6af031acb9e17758f8a7cd1/packages/core/src/types/reactor.ts#L106)
