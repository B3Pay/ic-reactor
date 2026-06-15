---
title: DisplayCodecVisitor
editUrl: false
next: true
prev: true
---

Defined in: [core/src/display/visitor.ts:52](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L52)

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

Defined in: [core/src/display/visitor.ts:55](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L55)

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

Defined in: [core/src/display/visitor.ts:59](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L59)

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

Defined in: [core/src/display/visitor.ts:63](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L63)

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

Defined in: [core/src/display/visitor.ts:67](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L67)

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

Defined in: [core/src/display/visitor.ts:71](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L71)

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

Defined in: [core/src/display/visitor.ts:75](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L75)

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

Defined in: [core/src/display/visitor.ts:79](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L79)

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

Defined in: [core/src/display/visitor.ts:83](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L83)

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

Defined in: [core/src/display/visitor.ts:87](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L87)

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

Defined in: [core/src/display/visitor.ts:98](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L98)

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

Defined in: [core/src/display/visitor.ts:109](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L109)

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

Defined in: [core/src/display/visitor.ts:113](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L113)

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

Defined in: [core/src/display/visitor.ts:133](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L133)

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

Defined in: [core/src/display/visitor.ts:150](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L150)

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

Defined in: [core/src/display/visitor.ts:178](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L178)

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

Defined in: [core/src/display/visitor.ts:182](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L182)

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

Defined in: [core/src/display/visitor.ts:247](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L247)

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

Defined in: [core/src/display/visitor.ts:266](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L266)

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

Defined in: [core/src/display/visitor.ts:298](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L298)

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

Defined in: [core/src/display/visitor.ts:323](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L323)

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

Defined in: [core/src/display/visitor.ts:415](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L415)

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

Defined in: [core/src/display/visitor.ts:437](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L437)

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

Defined in: [core/src/display/visitor.ts:460](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/display/visitor.ts#L460)

#### Parameters

##### \_t

`ServiceClass`

##### \_data

`unknown`

#### Returns

`ZodType`

#### Overrides

`IDL.Visitor.visitService`
