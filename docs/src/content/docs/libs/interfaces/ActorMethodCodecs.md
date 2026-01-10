---
title: ActorMethodCodecs
editUrl: false
next: true
prev: true
---

Defined in: [types/reactor.ts:148](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L148)

Helper type for actor method codecs returend by getCodec

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](../type-aliases/FunctionName.md)\<`A`\>

## Properties

### args

> **args**: [`ActorDisplayCodec`](ActorDisplayCodec.md)\<[`ArgsType`](../type-aliases/ArgsType.md)\<[`ActorMethodParameters`](../type-aliases/ActorMethodParameters.md)\<`A`\[`M`\]\>\>, [`DisplayOf`](../type-aliases/DisplayOf.md)\<[`ArgsType`](../type-aliases/ArgsType.md)\<[`ActorMethodParameters`](../type-aliases/ActorMethodParameters.md)\<`A`\[`M`\]\>\>\>\>

Defined in: [types/reactor.ts:149](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L149)

---

### result

> **result**: [`ActorDisplayCodec`](ActorDisplayCodec.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>, [`DisplayOf`](../type-aliases/DisplayOf.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>

Defined in: [types/reactor.ts:153](https://github.com/B3Pay/ic-reactor/blob/534a301ea2c4fadb0e5f381aff14d655ec8a719d/packages/core/src/types/reactor.ts#L153)
