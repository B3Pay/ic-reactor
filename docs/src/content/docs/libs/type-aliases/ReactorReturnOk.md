---
title: ReactorReturnOk
editUrl: false
next: true
prev: true
---

> **ReactorReturnOk**\<`A`, `M`, `Transform`\> = [`TransformReturnRegistry`](../interfaces/TransformReturnRegistry.md)\<[`OkResult`](OkResult.md)\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>, `A`\>\[`Transform`\]

Defined in: [types/reactor.ts:127](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/types/reactor.ts#L127)

Apply return type transformation based on the transform key.
Looks up the transform in TransformReturnRegistry.

## Type Parameters

### A

`A`

### M

`M` *extends* [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` *extends* [`TransformKey`](TransformKey.md) = `"candid"`
