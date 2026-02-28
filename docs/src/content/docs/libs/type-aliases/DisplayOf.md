---
title: DisplayOf
editUrl: false
next: true
prev: true
---

> **DisplayOf**\<`T`\> = [`IsOptionalType`](IsOptionalType.md)\<`T`\> *extends* `true` ? `AsOptional`\<`T`\> : [`IsBlobType`](IsBlobType.md)\<`T`\> *extends* `true` ? [`BlobType`](BlobType.md) : [`IsCandidVariant`](IsCandidVariant.md)\<`T`\> *extends* `true` ? `VariantUnionOf`\<`T`\> : `T` *extends* \[`string`, infer B\][] ? `Record`\<`string`, `DisplayOf`\<`B`\>\> : `T` *extends* `any`[] ? `{ [K in keyof T]: DisplayOf<T[K]> }` : `T` *extends* `null` ? `null` : `T` *extends* `Principal` ? `string` : `T` *extends* `object` ? `AsObject`\<`T`\> : [`DisplayCommonType`](DisplayCommonType.md)\<`T`\>

Defined in: [display/types.ts:63](https://github.com/B3Pay/ic-reactor/blob/e0f3465befa2e08ee6f1f6ff7d4b00fcc6d1ff89/packages/core/src/display/types.ts#L63)

## Type Parameters

### T

`T`
