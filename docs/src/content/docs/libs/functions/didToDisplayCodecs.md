---
title: didToDisplayCodecs
editUrl: false
next: true
prev: true
---

> **didToDisplayCodecs**\<`TTypes`\>(`didTypes`): \{ \[K in string \| number \| symbol\]: TTypes\[K\] extends Type\<TCandid\> ? ActorDisplayCodec\<TCandid, DisplayOf\<TCandid\>\> : never \}

Defined in: [core/src/display/helper.ts:22](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/display/helper.ts#L22)

## Type Parameters

### TTypes

`TTypes` _extends_ `Record`\<`string`, `Type`\<`any`\>\>

## Parameters

### didTypes

`TTypes`

## Returns

\{ \[K in string \| number \| symbol\]: TTypes\[K\] extends Type\<TCandid\> ? ActorDisplayCodec\<TCandid, DisplayOf\<TCandid\>\> : never \}
