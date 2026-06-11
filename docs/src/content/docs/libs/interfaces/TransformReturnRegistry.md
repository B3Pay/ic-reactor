---
title: TransformReturnRegistry
editUrl: false
next: true
prev: true
---

Defined in: [core/src/types/reactor.ts:95](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/reactor.ts#L95)

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

Defined in: [core/src/types/reactor.ts:96](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/reactor.ts#L96)

---

### display

> **display**: [`DisplayOf`](../type-aliases/DisplayOf.md)\<`T`\>

Defined in: [core/src/types/reactor.ts:97](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/reactor.ts#L97)
