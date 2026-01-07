---
title: ActorMethodCodecs
editUrl: false
next: true
prev: true
---

Defined in: [types/reactor.ts:155](https://github.com/B3Pay/ic-reactor/blob/88126d5d2dfbc2b99d2902449702514e86b6784e/packages/core/src/types/reactor.ts#L155)

Helper type for actor method codecs returend by getCodec

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](../type-aliases/FunctionName.md)\<`A`\>

## Properties

### args

> **args**: [`ActorDisplayCodec`](ActorDisplayCodec.md)\<[`ArgsType`](../type-aliases/ArgsType.md)\<[`ActorMethodParameters`](../type-aliases/ActorMethodParameters.md)\<`A`\[`M`\]\>\>, [`DisplayOf`](../type-aliases/DisplayOf.md)\<[`ArgsType`](../type-aliases/ArgsType.md)\<[`ActorMethodParameters`](../type-aliases/ActorMethodParameters.md)\<`A`\[`M`\]\>\>\>\>

Defined in: [types/reactor.ts:156](https://github.com/B3Pay/ic-reactor/blob/88126d5d2dfbc2b99d2902449702514e86b6784e/packages/core/src/types/reactor.ts#L156)

---

### result

> **result**: [`ActorDisplayCodec`](ActorDisplayCodec.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>, [`DisplayOf`](../type-aliases/DisplayOf.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>

Defined in: [types/reactor.ts:160](https://github.com/B3Pay/ic-reactor/blob/88126d5d2dfbc2b99d2902449702514e86b6784e/packages/core/src/types/reactor.ts#L160)
