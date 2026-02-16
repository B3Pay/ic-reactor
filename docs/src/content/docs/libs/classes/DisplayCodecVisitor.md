---
title: DisplayCodecVisitor
editUrl: false
next: true
prev: true
---

Defined in: [display/visitor.ts:12](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L12)

## Extends

- `Visitor`\<`unknown`, `z.ZodTypeAny`\>

## Constructors

### Constructor

> **new DisplayCodecVisitor**(): `DisplayCodecVisitor`

#### Returns

`DisplayCodecVisitor`

#### Inherited from

`IDL.Visitor<unknown, z.ZodTypeAny>.constructor`

## Methods

### visitType()

> **visitType**\<`T`\>(`t`, `data`): `ZodType`

Defined in: [display/visitor.ts:15](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L15)

#### Type Parameters

##### T

`T`

#### Parameters

##### t

`Type`\<`T`\>

##### data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitType`

---

### visitPrimitive()

> **visitPrimitive**\<`T`\>(`t`, `data`): `ZodType`

Defined in: [display/visitor.ts:19](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L19)

#### Type Parameters

##### T

`T`

#### Parameters

##### t

`PrimitiveType`\<`T`\>

##### data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitPrimitive`

---

### visitEmpty()

> **visitEmpty**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:23](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L23)

#### Parameters

##### \_t

`EmptyClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitEmpty`

---

### visitBool()

> **visitBool**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:27](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L27)

#### Parameters

##### \_t

`BoolClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitBool`

---

### visitNull()

> **visitNull**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:31](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L31)

#### Parameters

##### \_t

`NullClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitNull`

---

### visitReserved()

> **visitReserved**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:35](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L35)

#### Parameters

##### \_t

`ReservedClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitReserved`

---

### visitText()

> **visitText**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:39](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L39)

#### Parameters

##### \_t

`TextClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitText`

---

### visitNumber()

> **visitNumber**\<`T`\>(`t`, `data`): `ZodType`

Defined in: [display/visitor.ts:43](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L43)

#### Type Parameters

##### T

`T`

#### Parameters

##### t

`PrimitiveType`\<`T`\>

##### data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitNumber`

---

### visitInt()

> **visitInt**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:47](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L47)

#### Parameters

##### \_t

`IntClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitInt`

---

### visitNat()

> **visitNat**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:58](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L58)

#### Parameters

##### \_t

`NatClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitNat`

---

### visitFloat()

> **visitFloat**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:69](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L69)

#### Parameters

##### \_t

`FloatClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitFloat`

---

### visitFixedInt()

> **visitFixedInt**(`t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:73](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L73)

#### Parameters

##### t

`FixedIntClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitFixedInt`

---

### visitFixedNat()

> **visitFixedNat**(`t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:92](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L92)

#### Parameters

##### t

`FixedNatClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitFixedNat`

---

### visitPrincipal()

> **visitPrincipal**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:109](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L109)

#### Parameters

##### \_t

`PrincipalClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitPrincipal`

---

### visitConstruct()

> **visitConstruct**\<`T`\>(`t`, `data`): `ZodType`

Defined in: [display/visitor.ts:126](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L126)

#### Type Parameters

##### T

`T`

#### Parameters

##### t

`ConstructType`\<`T`\>

##### data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitConstruct`

---

### visitVec()

> **visitVec**\<`T`\>(`_t`, `elemType`, `_data`): `ZodType`

Defined in: [display/visitor.ts:130](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L130)

#### Type Parameters

##### T

`T`

#### Parameters

##### \_t

`VecClass`\<`T`\>

##### elemType

`Type`\<`T`\>

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitVec`

---

### visitOpt()

> **visitOpt**\<`T`\>(`_t`, `elemType`, `_data`): `ZodType`

Defined in: [display/visitor.ts:195](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L195)

#### Type Parameters

##### T

`T`

#### Parameters

##### \_t

`OptClass`\<`T`\>

##### elemType

`Type`\<`T`\>

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitOpt`

---

### visitRecord()

> **visitRecord**(`_t`, `fields`, `_data`): `ZodType`

Defined in: [display/visitor.ts:214](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L214)

#### Parameters

##### \_t

`RecordClass`

##### fields

\[`string`, `Type`\<`any`\>\][]

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitRecord`

---

### visitTuple()

> **visitTuple**\<`T`\>(`_t`, `components`, `_data`): `ZodType`

Defined in: [display/visitor.ts:246](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L246)

#### Type Parameters

##### T

`T` _extends_ `any`[]

#### Parameters

##### \_t

`TupleClass`\<`T`\>

##### components

`Type`\<`any`\>[]

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitTuple`

---

### visitVariant()

> **visitVariant**(`_t`, `fields`, `_data`): `ZodType`

Defined in: [display/visitor.ts:271](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L271)

#### Parameters

##### \_t

`VariantClass`

##### fields

\[`string`, `Type`\<`any`\>\][]

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitVariant`

---

### visitRec()

> **visitRec**\<`T`\>(`t`, `ty`, `data`): `ZodType`

Defined in: [display/visitor.ts:363](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L363)

#### Type Parameters

##### T

`T`

#### Parameters

##### t

`RecClass`\<`T`\>

##### ty

`ConstructType`\<`T`\>

##### data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitRec`

---

### visitFunc()

> **visitFunc**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:385](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L385)

#### Parameters

##### \_t

`FuncClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitFunc`

---

### visitService()

> **visitService**(`_t`, `_data`): `ZodType`

Defined in: [display/visitor.ts:408](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/display/visitor.ts#L408)

#### Parameters

##### \_t

`ServiceClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitService`
