---
title: ReactorReturnErr
editUrl: false
next: true
prev: true
---

> **ReactorReturnErr**\<`A`, `M`, `Transform`\> = [`CanisterError`](../classes/CanisterError.md)\<[`TransformReturnRegistry`](../interfaces/TransformReturnRegistry.md)\<[`ErrResult`](ErrResult.md)\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>, `A`\>\[`Transform`\]\> \| [`CallError`](../classes/CallError.md)

Defined in: [types/reactor.ts:133](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/reactor.ts#L133)

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` _extends_ [`TransformKey`](TransformKey.md) = `"candid"`
