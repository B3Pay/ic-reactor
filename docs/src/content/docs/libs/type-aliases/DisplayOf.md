---
title: DisplayOf
editUrl: false
next: true
prev: true
---

> **DisplayOf**\<`T`\> = [`IsOptionalType`](IsOptionalType.md)\<`T`\> _extends_ `true` ? `AsOptional`\<`T`\> : [`IsBlobType`](IsBlobType.md)\<`T`\> _extends_ `true` ? [`BlobType`](BlobType.md) : [`IsCandidVariant`](IsCandidVariant.md)\<`T`\> _extends_ `true` ? `VariantUnionOf`\<`T`\> : `T` _extends_ \[`string`, infer B\][] ? `Map`\<`string`, `DisplayOf`\<`B`\>\> : `T` _extends_ infer U[] ? `DisplayOf`\<`U`\>[] : `T` _extends_ `null` ? `null` : `T` _extends_ `Principal` ? `string` : `T` _extends_ `object` ? `AsObject`\<`T`\> : [`DisplayCommonType`](DisplayCommonType.md)\<`T`\>

Defined in: [display/types.ts:63](https://github.com/B3Pay/ic-reactor/blob/712cb4b02afa232312fb1e7f5fb0ca16e419e7e8/packages/core/src/display/types.ts#L63)

## Type Parameters

### T

`T`
