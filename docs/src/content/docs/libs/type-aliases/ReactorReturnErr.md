---
title: ReactorReturnErr
editUrl: false
next: true
prev: true
---

> **ReactorReturnErr**\<`A`, `M`, `Transform`\> = [`CanisterError`](../classes/CanisterError.md)\<[`TransformReturnRegistry`](../interfaces/TransformReturnRegistry.md)\<[`ErrResult`](ErrResult.md)\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>, `A`\>\[`Transform`\]\> \| [`CallError`](../classes/CallError.md)

Defined in: [types/reactor.ts:133](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/types/reactor.ts#L133)

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` _extends_ [`TransformKey`](TransformKey.md) = `"candid"`
