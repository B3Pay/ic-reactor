---
title: ReactorArgs
editUrl: false
next: true
prev: true
---

> **ReactorArgs**\<`A`, `M`, `Transform`\> = [`TransformArgsRegistry`](../interfaces/TransformArgsRegistry.md)\<[`ActorMethodParameters`](ActorMethodParameters.md)\<`A`\[`M`\]\>\>\[`Transform`\]

Defined in: [types/reactor.ts:126](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/types/reactor.ts#L126)

Apply argument transformation based on the transform key.
Looks up the transform in TransformArgsRegistry.

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` _extends_ [`TransformKey`](TransformKey.md) = `"candid"`
