---
title: DisplayReactorParameters
editUrl: false
next: true
prev: true
---

Defined in: [types/display-reactor.ts:63](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/types/display-reactor.ts#L63)

## Extends

- [`ReactorParameters`](ReactorParameters.md)

## Type Parameters

### A

`A` = [`BaseActor`](../type-aliases/BaseActor.md)

## Properties

### validators?

> `optional` **validators**: `Partial`\<`{ [M in string]: DisplayValidator<A, M> }`\>

Defined in: [types/display-reactor.ts:70](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/types/display-reactor.ts#L70)

Optional initial validators to register.
Validators receive display types (strings for Principal, bigint, etc.)

---

### clientManager

> **clientManager**: [`ClientManager`](../classes/ClientManager.md)

Defined in: [types/reactor.ts:37](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/types/reactor.ts#L37)

#### Inherited from

[`ReactorParameters`](ReactorParameters.md).[`clientManager`](ReactorParameters.md#clientmanager)

---

### name

> **name**: `string`

Defined in: [types/reactor.ts:38](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/types/reactor.ts#L38)

#### Inherited from

[`ReactorParameters`](ReactorParameters.md).[`name`](ReactorParameters.md#name)

---

### idlFactory()

> **idlFactory**: (`IDL`) => `any`

Defined in: [types/reactor.ts:39](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/types/reactor.ts#L39)

#### Parameters

##### IDL

`any`

#### Returns

`any`

#### Inherited from

[`ReactorParameters`](ReactorParameters.md).[`idlFactory`](ReactorParameters.md#idlfactory)

---

### canisterId?

> `optional` **canisterId**: [`CanisterId`](../type-aliases/CanisterId.md)

Defined in: [types/reactor.ts:40](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/types/reactor.ts#L40)

#### Inherited from

[`ReactorParameters`](ReactorParameters.md).[`canisterId`](ReactorParameters.md#canisterid)

---

### pollingOptions?

> `optional` **pollingOptions**: `PollingOptions`

Defined in: [types/reactor.ts:41](https://github.com/B3Pay/ic-reactor/blob/4486d2c7aa6330ac10c9ca4c4627705e94045f59/packages/core/src/types/reactor.ts#L41)

#### Inherited from

[`ReactorParameters`](ReactorParameters.md).[`pollingOptions`](ReactorParameters.md#pollingoptions)
