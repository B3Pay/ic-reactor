---
editUrl: false
next: true
prev: true
---

Defined in: [core/src/display/types.ts:87](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/display/types.ts#L87)

## Type Parameters

### TC

`TC` = `unknown`

### TD

`TD` = [`DisplayOf`](../type-aliases/DisplayOf.md)\<`TC`\>

## Properties

### codec

> **codec**: [`DisplayCodec`](../type-aliases/DisplayCodec.md)\<`TC`, `TD`\>

Defined in: [core/src/display/types.ts:88](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/display/types.ts#L88)

---

### asDisplay

> **asDisplay**: (`val`) => `TD`

Defined in: [core/src/display/types.ts:89](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/display/types.ts#L89)

#### Parameters

##### val

`TC`

#### Returns

`TD`

---

### asCandid

> **asCandid**: (`val`) => `TC`

Defined in: [core/src/display/types.ts:90](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/display/types.ts#L90)

#### Parameters

##### val

`TD`

#### Returns

`TC`
