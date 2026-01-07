---
title: ActorMethodType
editUrl: false
next: true
prev: true
---

> **ActorMethodType**\<`A`, `M`\> = `Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

Defined in: [types/reactor.ts:54](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/types/reactor.ts#L54)

## Type Parameters

### A

`A`

### M

`M` _extends_ keyof `A`

> **ActorMethodType**(...`args`): `Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

Defined in: [types/reactor.ts:55](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/types/reactor.ts#L55)

## Parameters

### args

...[`ActorMethodParameters`](ActorMethodParameters.md)\<`A`\[`M`\]\>

## Returns

`Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

## Properties

### withOptions()

> **withOptions**: (`options?`) => (...`args`) => `Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

Defined in: [types/reactor.ts:56](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/types/reactor.ts#L56)

#### Parameters

##### options?

`CallConfig`

#### Returns

> (...`args`): `Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

##### Parameters

###### args

...[`ActorMethodParameters`](ActorMethodParameters.md)\<`A`\[`M`\]\>

##### Returns

`Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>
