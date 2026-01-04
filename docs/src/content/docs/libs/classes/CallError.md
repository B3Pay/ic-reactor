---
title: CallError
editUrl: false
next: true
prev: true
---

Defined in: [errors/index.ts:16](https://github.com/B3Pay/ic-reactor/blob/55f4ba80020af05ee4cac7b0f8c679b25ab2a717/packages/core/src/errors/index.ts#L16)

Error thrown when there's an issue calling the canister.
This includes network errors, agent errors, canister not found, etc.

## Extends

- `Error`

## Constructors

### Constructor

> **new CallError**(`message`, `cause?`): `CallError`

Defined in: [errors/index.ts:19](https://github.com/B3Pay/ic-reactor/blob/55f4ba80020af05ee4cac7b0f8c679b25ab2a717/packages/core/src/errors/index.ts#L19)

#### Parameters

##### message

`string`

##### cause?

`unknown`

#### Returns

`CallError`

#### Overrides

`Error.constructor`

## Properties

### cause?

> `readonly` `optional` **cause**: `unknown`

Defined in: [errors/index.ts:17](https://github.com/B3Pay/ic-reactor/blob/55f4ba80020af05ee4cac7b0f8c679b25ab2a717/packages/core/src/errors/index.ts#L17)
