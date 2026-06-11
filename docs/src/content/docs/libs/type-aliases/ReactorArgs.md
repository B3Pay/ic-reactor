---
title: ReactorArgs
editUrl: false
next: true
prev: true
---

> **ReactorArgs**\<`A`, `M`, `Transform`\> = [`TransformArgsRegistry`](../interfaces/TransformArgsRegistry.md)\<[`ActorMethodParameters`](ActorMethodParameters.md)\<`A`\[`M`\]\>\>\[`Transform`\]

Defined in: [core/src/types/reactor.ts:117](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/core/src/types/reactor.ts#L117)

Apply argument transformation based on the transform key.
Looks up the transform in TransformArgsRegistry.

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` _extends_ [`TransformKey`](TransformKey.md) = `"candid"`
