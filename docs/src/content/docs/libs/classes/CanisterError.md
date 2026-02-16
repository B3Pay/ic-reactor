---
title: CanisterError
editUrl: false
next: true
prev: true
---

Defined in: [errors/index.ts:40](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/errors/index.ts#L40)

Error thrown when the canister returns an Err result.
The `err` property contains the typed error value from the canister.

It also supports accessing `code`, `message`, and `details` directly
if the error object follows the common API error format or is a variant.

## Extends

- `Error`

## Type Parameters

### E

`E` = `unknown`

The type of the error value from the canister

## Constructors

### Constructor

> **new CanisterError**\<`E`\>(`err`): `CanisterError`\<`E`\>

Defined in: [errors/index.ts:48](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/errors/index.ts#L48)

#### Parameters

##### err

`E`

#### Returns

`CanisterError`\<`E`\>

#### Overrides

`Error.constructor`

## Properties

### err

> `readonly` **err**: `E`

Defined in: [errors/index.ts:42](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/errors/index.ts#L42)

The raw error value from the canister

---

### code

> `readonly` **code**: `string`

Defined in: [errors/index.ts:44](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/errors/index.ts#L44)

The error code, extracted from the error object or variant key

---

### details

> `readonly` **details**: [`NullishType`](../type-aliases/NullishType.md)\<`Map`\<`string`, `string`\>\>

Defined in: [errors/index.ts:46](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/errors/index.ts#L46)

Optional error details Map

## Methods

### isApiError()

> `static` **isApiError**(`error`): `error is ApiError`

Defined in: [errors/index.ts:105](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/errors/index.ts#L105)

Type guard to check if an error object follows the API error format.

#### Parameters

##### error

`unknown`

#### Returns

`error is ApiError`

---

### create()

> `static` **create**(`error`, `message?`): `CanisterError`

Defined in: [errors/index.ts:119](https://github.com/B3Pay/ic-reactor/blob/4a2ab302b34c2a73abcf0c46325c6598c6e013b4/packages/core/src/errors/index.ts#L119)

Factory method to create a CanisterError from any error.
If the input is already a CanisterError, it returns it.
If it's an API error shape, it wraps it.
Otherwise, it creates a new CanisterError with an "UNKNOWN_ERROR" code.

#### Parameters

##### error

`unknown`

##### message?

`string`

#### Returns

`CanisterError`
