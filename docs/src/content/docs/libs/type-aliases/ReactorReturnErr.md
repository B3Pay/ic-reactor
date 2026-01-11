---
title: ReactorReturnErr
editUrl: false
next: true
prev: true
---

> **ReactorReturnErr**\<`A`, `M`, `Transform`\> = [`CanisterError`](../classes/CanisterError.md)\<[`TransformReturnRegistry`](../interfaces/TransformReturnRegistry.md)\<[`ErrResult`](ErrResult.md)\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>\[`Transform`\]\> \| [`CallError`](../classes/CallError.md)

Defined in: [types/reactor.ts:135](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/types/reactor.ts#L135)

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` _extends_ [`TransformKey`](TransformKey.md) = `"candid"`
