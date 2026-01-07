---
title: DisplayCodecVisitor
editUrl: false
next: true
prev: true
---

Defined in: [display/visitor.ts:8](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L8)

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

Defined in: [display/visitor.ts:9](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L9)

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

Defined in: [display/visitor.ts:13](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L13)

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

Defined in: [display/visitor.ts:17](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L17)

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

Defined in: [display/visitor.ts:21](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L21)

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

Defined in: [display/visitor.ts:25](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L25)

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

Defined in: [display/visitor.ts:29](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L29)

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

Defined in: [display/visitor.ts:33](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L33)

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

Defined in: [display/visitor.ts:37](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L37)

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

Defined in: [display/visitor.ts:41](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L41)

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

Defined in: [display/visitor.ts:52](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L52)

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

Defined in: [display/visitor.ts:63](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L63)

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

Defined in: [display/visitor.ts:67](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L67)

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

Defined in: [display/visitor.ts:86](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L86)

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

Defined in: [display/visitor.ts:103](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L103)

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

Defined in: [display/visitor.ts:120](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L120)

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

Defined in: [display/visitor.ts:124](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L124)

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

Defined in: [display/visitor.ts:184](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L184)

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

Defined in: [display/visitor.ts:213](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L213)

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

Defined in: [display/visitor.ts:261](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L261)

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

Defined in: [display/visitor.ts:290](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L290)

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

> **visitRec**\<`T`\>(`_t`, `ty`, `data`): `ZodType`

Defined in: [display/visitor.ts:385](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L385)

#### Type Parameters

##### T

`T`

#### Parameters

##### \_t

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

Defined in: [display/visitor.ts:394](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L394)

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

Defined in: [display/visitor.ts:428](https://github.com/B3Pay/ic-reactor/blob/4618b1fd582f00e75c259e0bc6fa022ad77dba5b/packages/core/src/display/visitor.ts#L428)

#### Parameters

##### \_t

`ServiceClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitService`
