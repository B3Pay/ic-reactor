---
title: ReactorArgs
editUrl: false
next: true
prev: true
---

> **ReactorArgs**\<`A`, `M`, `Transform`\> = [`TransformArgsRegistry`](../interfaces/TransformArgsRegistry.md)\<[`ActorMethodParameters`](ActorMethodParameters.md)\<`A`\[`M`\]\>\>\[`Transform`\]

Defined in: [types/reactor.ts:117](https://github.com/B3Pay/ic-reactor/blob/1ad0d6bf29dfde414a8adc8f90acf0e842bdda09/packages/core/src/types/reactor.ts#L117)

Apply argument transformation based on the transform key.
Looks up the transform in TransformArgsRegistry.

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` _extends_ [`TransformKey`](TransformKey.md) = `"candid"`
