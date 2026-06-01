---
title: ActorMethodCodecs
editUrl: false
next: true
prev: true
---

Defined in: [core/src/types/reactor.ts:149](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/reactor.ts#L149)

Helper type for actor method codecs returend by getCodec

## Type Parameters

### A

`A`

### M

`M` _extends_ [`FunctionName`](../type-aliases/FunctionName.md)\<`A`\>

## Properties

### args

> **args**: [`ActorDisplayCodec`](ActorDisplayCodec.md)\<[`ArgsType`](../type-aliases/ArgsType.md)\<[`ActorMethodParameters`](../type-aliases/ActorMethodParameters.md)\<`A`\[`M`\]\>\>, [`DisplayOf`](../type-aliases/DisplayOf.md)\<[`ArgsType`](../type-aliases/ArgsType.md)\<[`ActorMethodParameters`](../type-aliases/ActorMethodParameters.md)\<`A`\[`M`\]\>\>\>\>

Defined in: [core/src/types/reactor.ts:150](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/reactor.ts#L150)

---

### result

> **result**: [`ActorDisplayCodec`](ActorDisplayCodec.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>, [`DisplayOf`](../type-aliases/DisplayOf.md)\<[`ActorMethodReturnType`](../type-aliases/ActorMethodReturnType.md)\<`A`\[`M`\]\>\>\>

Defined in: [core/src/types/reactor.ts:154](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/types/reactor.ts#L154)
