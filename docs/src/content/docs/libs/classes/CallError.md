---
title: CallError
editUrl: false
next: true
prev: true
---

Defined in: [errors/index.ts:16](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/errors/index.ts#L16)

Error thrown when there's an issue calling the canister.
This includes network errors, agent errors, canister not found, etc.

## Extends

- `Error`

## Constructors

### Constructor

> **new CallError**(`message`, `cause?`): `CallError`

Defined in: [errors/index.ts:19](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/errors/index.ts#L19)

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

Defined in: [errors/index.ts:17](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/errors/index.ts#L17)
