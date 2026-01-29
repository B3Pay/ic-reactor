---
title: DisplayOf
editUrl: false
next: true
prev: true
---

> **DisplayOf**\<`T`\> = [`IsOptionalType`](IsOptionalType.md)\<`T`\> _extends_ `true` ? `AsOptional`\<`T`\> : [`IsBlobType`](IsBlobType.md)\<`T`\> _extends_ `true` ? [`BlobType`](BlobType.md) : [`IsCandidVariant`](IsCandidVariant.md)\<`T`\> _extends_ `true` ? `VariantUnionOf`\<`T`\> : `T` _extends_ \[`string`, infer B\][] ? `Record`\<`string`, `DisplayOf`\<`B`\>\> : `T` _extends_ infer U[] ? `DisplayOf`\<`U`\>[] : `T` _extends_ `null` ? `null` : `T` _extends_ `Principal` ? `string` : `T` _extends_ `object` ? `AsObject`\<`T`\> : [`DisplayCommonType`](DisplayCommonType.md)\<`T`\>

Defined in: [display/types.ts:63](https://github.com/B3Pay/ic-reactor/blob/4d02e8d8d928d42fa1d6f6a89a0eba4531459b4e/packages/core/src/display/types.ts#L63)

## Type Parameters

### T

`T`
