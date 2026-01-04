---
title: CallError
editUrl: false
next: true
prev: true
---

Defined in: [errors/index.ts:16](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/errors/index.ts#L16)

Error thrown when there's an issue calling the canister.
This includes network errors, agent errors, canister not found, etc.

## Extends

- `Error`

## Constructors

### Constructor

> **new CallError**(`message`, `cause?`): `CallError`

Defined in: [errors/index.ts:19](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/errors/index.ts#L19)

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

Defined in: [errors/index.ts:17](https://github.com/B3Pay/ic-reactor/blob/aad0bdc1ee05709f7192e1fae941b16eb3c0883b/packages/core/src/errors/index.ts#L17)
