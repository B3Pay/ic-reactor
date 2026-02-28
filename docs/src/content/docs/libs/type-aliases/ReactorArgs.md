---
title: ReactorArgs
editUrl: false
next: true
prev: true
---

> **ReactorArgs**\<`A`, `M`, `Transform`\> = [`TransformArgsRegistry`](../interfaces/TransformArgsRegistry.md)\<[`ActorMethodParameters`](ActorMethodParameters.md)\<`A`\[`M`\]\>\>\[`Transform`\]

Defined in: [types/reactor.ts:117](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/types/reactor.ts#L117)

Apply argument transformation based on the transform key.
Looks up the transform in TransformArgsRegistry.

## Type Parameters

### A

`A`

### M

`M` *extends* [`FunctionName`](FunctionName.md)\<`A`\>

### Transform

`Transform` *extends* [`TransformKey`](TransformKey.md) = `"candid"`
