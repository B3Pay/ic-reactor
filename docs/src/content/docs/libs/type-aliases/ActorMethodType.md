---
title: ActorMethodType
editUrl: false
next: true
prev: true
---

> **ActorMethodType**\<`A`, `M`\> = `Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

Defined in: [core/src/types/reactor.ts:44](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/types/reactor.ts#L44)

## Type Parameters

### A

`A`

### M

`M` _extends_ keyof `A`

> **ActorMethodType**(...`args`): `Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

## Parameters

### args

...[`ActorMethodParameters`](ActorMethodParameters.md)\<`A`\[`M`\]\>

## Returns

`Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

## Properties

### withOptions

> **withOptions**: (`options?`) => (...`args`) => `Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

Defined in: [core/src/types/reactor.ts:46](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/types/reactor.ts#L46)

#### Parameters

##### options?

`CallConfig`

#### Returns

(...`args`) => `Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>
