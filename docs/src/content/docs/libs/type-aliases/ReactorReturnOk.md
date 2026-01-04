---
title: ReactorReturnOk
editUrl: false
next: true
prev: true
---

> **ReactorReturnOk**\<`A`, `M`, `Transform`\> = [`TransformReturnRegistry`](../interfaces/TransformReturnRegistry.md)\<[`OkResult`](OkResult.md)\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\[`Transform`\]

Defined in: [types/reactor.ts:136](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/types/reactor.ts#L136)

Apply return type transformation based on the transform key.
Looks up the transform in TransformReturnRegistry.

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` _extends_ [`TransformKey`](TransformKey.md) = `"candid"`
