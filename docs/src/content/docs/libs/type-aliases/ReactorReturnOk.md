---
title: ReactorReturnOk
editUrl: false
next: true
prev: true
---

> **ReactorReturnOk**\<`A`, `M`, `Transform`\> = [`TransformReturnRegistry`](../interfaces/TransformReturnRegistry.md)\<[`OkResult`](OkResult.md)\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\[`Transform`\]

Defined in: [types/reactor.ts:129](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/types/reactor.ts#L129)

Apply return type transformation based on the transform key.
Looks up the transform in TransformReturnRegistry.

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` _extends_ [`TransformKey`](TransformKey.md) = `"candid"`
