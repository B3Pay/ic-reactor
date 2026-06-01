---
title: ReactorReturnOk
editUrl: false
next: true
prev: true
---

> **ReactorReturnOk**\<`A`, `M`, `Transform`\> = [`TransformReturnRegistry`](../interfaces/TransformReturnRegistry.md)\<[`OkResult`](OkResult.md)\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>, `A`\>\[`Transform`\]

Defined in: [core/src/types/reactor.ts:127](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/reactor.ts#L127)

Apply return type transformation based on the transform key.
Looks up the transform in TransformReturnRegistry.

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` _extends_ [`TransformKey`](TransformKey.md) = `"candid"`
