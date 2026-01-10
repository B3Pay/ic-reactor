---
title: TransformReturnRegistry
editUrl: false
next: true
prev: true
---

Defined in: [types/reactor.ts:97](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L97)

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

Defined in: [types/reactor.ts:98](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L98)

---

### display

> **display**: [`DisplayOf`](../type-aliases/DisplayOf.md)\<`T`\>

Defined in: [types/reactor.ts:99](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L99)
