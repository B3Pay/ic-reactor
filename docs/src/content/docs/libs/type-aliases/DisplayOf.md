---
title: DisplayOf
editUrl: false
next: true
prev: true
---

> **DisplayOf**\<`T`\> = [`IsOptionalType`](IsOptionalType.md)\<`T`\> *extends* `true` ? `AsOptional`\<`T`\> : [`IsBlobType`](IsBlobType.md)\<`T`\> *extends* `true` ? [`BlobType`](BlobType.md) : [`IsCandidVariant`](IsCandidVariant.md)\<`T`\> *extends* `true` ? `VariantUnionOf`\<`T`\> : `T` *extends* \[`string`, infer B\][] ? `Map`\<`string`, `DisplayOf`\<`B`\>\> : `T` *extends* infer U[] ? `DisplayOf`\<`U`\>[] : `T` *extends* `null` ? `null` : `T` *extends* `Principal` ? `string` : `T` *extends* `object` ? `AsObject`\<`T`\> : [`DisplayCommonType`](DisplayCommonType.md)\<`T`\>

Defined in: [display/types.ts:63](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/display/types.ts#L63)

## Type Parameters

### T

`T`
