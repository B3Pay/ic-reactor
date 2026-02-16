---
title: didToDisplayCodecs
editUrl: false
next: true
prev: true
---

> **didToDisplayCodecs**\<`TTypes`\>(`didTypes`): \{ \[K in string \| number \| symbol\]: TTypes\[K\] extends Type\<TCandid\> ? ActorDisplayCodec\<TCandid, DisplayOf\<TCandid\>\> : never \}

Defined in: [display/helper.ts:22](https://github.com/B3Pay/ic-reactor/blob/1ad0d6bf29dfde414a8adc8f90acf0e842bdda09/packages/core/src/display/helper.ts#L22)

## Type Parameters

### TTypes

`TTypes` _extends_ `Record`\<`string`, `Type`\<`any`\>\>

## Parameters

### didTypes

`TTypes`

## Returns

\{ \[K in string \| number \| symbol\]: TTypes\[K\] extends Type\<TCandid\> ? ActorDisplayCodec\<TCandid, DisplayOf\<TCandid\>\> : never \}
