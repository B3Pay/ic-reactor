---
title: TransformReturnRegistry
editUrl: false
next: true
prev: true
---

Defined in: [types/reactor.ts:95](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/types/reactor.ts#L95)

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

### A

`A` = [`BaseActor`](../type-aliases/BaseActor.md)

## Properties

### candid

> **candid**: `T`

Defined in: [types/reactor.ts:96](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/types/reactor.ts#L96)

---

### display

> **display**: [`DisplayOf`](../type-aliases/DisplayOf.md)\<`T`\>

Defined in: [types/reactor.ts:97](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/types/reactor.ts#L97)
