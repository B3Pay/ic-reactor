---
title: ValidationError
editUrl: false
next: true
prev: true
---

Defined in: [core/src/errors/index.ts:214](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/errors/index.ts#L214)

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

Defined in: [core/src/errors/index.ts:220](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/errors/index.ts#L220)

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

Defined in: [core/src/errors/index.ts:216](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/errors/index.ts#L216)

Array of validation issues

---

### methodName

> `readonly` **methodName**: `string`

Defined in: [core/src/errors/index.ts:218](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/errors/index.ts#L218)

The method name that failed validation

## Methods

### getIssuesForPath()

> **getIssuesForPath**(`path`): [`ValidationIssue`](../interfaces/ValidationIssue.md)[]

Defined in: [core/src/errors/index.ts:236](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/errors/index.ts#L236)

Get issues for a specific field path

#### Parameters

##### path

`string`

#### Returns

[`ValidationIssue`](../interfaces/ValidationIssue.md)[]

---

### hasErrorForPath()

> **hasErrorForPath**(`path`): `boolean`

Defined in: [core/src/errors/index.ts:243](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/errors/index.ts#L243)

Check if a specific field has errors

#### Parameters

##### path

`string`

#### Returns

`boolean`
