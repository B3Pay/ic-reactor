---
title: ValidationError
editUrl: false
next: true
prev: true
---

Defined in: [errors/index.ts:207](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/errors/index.ts#L207)

Error thrown when argument validation fails before calling the canister.
Contains detailed information about which fields failed validation.

## Example

```typescript
try {
  await reactor.callMethod({
    functionName: "transfer",
    args: [{ to: "", amount: -100 }],
  })
} catch (error) {
  if (isValidationError(error)) {
    console.log(error.issues)
    // [
    //   { path: ["to"], message: "Recipient is required" },
    //   { path: ["amount"], message: "Amount must be positive" }
    // ]
  }
}
```

## Extends

- `Error`

## Constructors

### Constructor

> **new ValidationError**(`methodName`, `issues`): `ValidationError`

Defined in: [errors/index.ts:213](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/errors/index.ts#L213)

#### Parameters

##### methodName

`string`

##### issues

[`ValidationIssue`](../interfaces/ValidationIssue.md)[]

#### Returns

`ValidationError`

#### Overrides

`Error.constructor`

## Properties

### issues

> `readonly` **issues**: [`ValidationIssue`](../interfaces/ValidationIssue.md)[]

Defined in: [errors/index.ts:209](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/errors/index.ts#L209)

Array of validation issues

---

### methodName

> `readonly` **methodName**: `string`

Defined in: [errors/index.ts:211](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/errors/index.ts#L211)

The method name that failed validation

## Methods

### getIssuesForPath()

> **getIssuesForPath**(`path`): [`ValidationIssue`](../interfaces/ValidationIssue.md)[]

Defined in: [errors/index.ts:229](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/errors/index.ts#L229)

Get issues for a specific field path

#### Parameters

##### path

`string`

#### Returns

[`ValidationIssue`](../interfaces/ValidationIssue.md)[]

---

### hasErrorForPath()

> **hasErrorForPath**(`path`): `boolean`

Defined in: [errors/index.ts:236](https://github.com/b3hr4d/ic-reactor-v3/blob/de652f98d9499faeb8ab72104033a6b97336fe47/packages/core/src/errors/index.ts#L236)

Check if a specific field has errors

#### Parameters

##### path

`string`

#### Returns

`boolean`
