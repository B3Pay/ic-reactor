---
title: didToDisplayCodecs
editUrl: false
next: true
prev: true
---

> **didToDisplayCodecs**\<`TTypes`\>(`didTypes`): \{ \[K in string \| number \| symbol\]: TTypes\[K\] extends Type\<TCandid\> ? ActorDisplayCodec\<TCandid, DisplayOf\<TCandid\>\> : never \}

Defined in: [core/src/display/helper.ts:22](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/display/helper.ts#L22)

## Type Parameters

### TTypes

`TTypes` _extends_ `Record`\<`string`, `Type`\<`any`\>\>

## Parameters

### didTypes

`TTypes`

## Returns

\{ \[K in string \| number \| symbol\]: TTypes\[K\] extends Type\<TCandid\> ? ActorDisplayCodec\<TCandid, DisplayOf\<TCandid\>\> : never \}
