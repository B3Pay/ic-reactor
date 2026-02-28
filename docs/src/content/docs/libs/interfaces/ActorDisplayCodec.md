---
title: ActorDisplayCodec
editUrl: false
next: true
prev: true
---

Defined in: [display/types.ts:87](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/display/types.ts#L87)

## Type Parameters

### TC

`TC` = `unknown`

### TD

`TD` = [`DisplayOf`](../type-aliases/DisplayOf.md)\<`TC`\>

## Properties

### codec

> **codec**: [`DisplayCodec`](../type-aliases/DisplayCodec.md)\<`TC`, `TD`\>

Defined in: [display/types.ts:88](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/display/types.ts#L88)

***

### asDisplay()

> **asDisplay**: (`val`) => `TD`

Defined in: [display/types.ts:89](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/display/types.ts#L89)

#### Parameters

##### val

`TC`

#### Returns

`TD`

***

### asCandid()

> **asCandid**: (`val`) => `TC`

Defined in: [display/types.ts:90](https://github.com/B3Pay/ic-reactor/blob/d7917e29daff163fdeec6d2e30eaec8ba1450c86/packages/core/src/display/types.ts#L90)

#### Parameters

##### val

`TD`

#### Returns

`TC`
