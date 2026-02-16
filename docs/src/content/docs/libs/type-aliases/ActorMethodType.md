---
title: ActorMethodType
editUrl: false
next: true
prev: true
---

> **ActorMethodType**\<`A`, `M`\> = `Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

Defined in: [types/reactor.ts:44](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/reactor.ts#L44)

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

### withOptions()

> **withOptions**: (`options?`) => (...`args`) => `Promise`\<[`ActorMethodReturnType`](ActorMethodReturnType.md)\<`A`\[`M`\]\>\>

Defined in: [types/reactor.ts:46](https://github.com/B3Pay/ic-reactor/blob/cf54e1ad8c3da2b3da74d165a74aa76f952c49e1/packages/core/src/types/reactor.ts#L46)

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
