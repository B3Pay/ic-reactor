---
title: AuthStateStore
editUrl: false
next: true
prev: true
---

Defined in: [auth/src/auth-state-store.ts:19](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/auth-state-store.ts#L19)

Holds authentication state and notifies subscribers on change.

Each update increments a monotonic revision so callers can detect whether
the state they are about to act on is still current (used to ignore the
result of stale async session-restore work).

## Example

```ts
const store = new AuthStateStore()
const unsubscribe = store.subscribe((state) => console.log(state))
store.update({ isAuthenticating: true })
```

## Constructors

### Constructor

> **new AuthStateStore**(): `AuthStateStore`

#### Returns

`AuthStateStore`

## Properties

### state

> **state**: [`AuthState`](../interfaces/AuthState.md)

Defined in: [auth/src/auth-state-store.ts:23](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/auth-state-store.ts#L23)

## Accessors

### currentRevision

#### Get Signature

> **get** **currentRevision**(): `number`

Defined in: [auth/src/auth-state-store.ts:31](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/auth-state-store.ts#L31)

The current revision. Increments on every [update](#update).

##### Returns

`number`

## Methods

### subscribe()

> **subscribe**(`callback`): () => `void`

Defined in: [auth/src/auth-state-store.ts:39](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/auth-state-store.ts#L39)

Subscribe to state changes.

#### Parameters

##### callback

(`state`) => `void`

#### Returns

An unsubscribe function.

() => `void`

---

### update()

> **update**(`newState`): `void`

Defined in: [auth/src/auth-state-store.ts:49](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/auth/src/auth-state-store.ts#L49)

Merge a partial state, bump the revision, and notify subscribers.

#### Parameters

##### newState

`Partial`\<[`AuthState`](../interfaces/AuthState.md)\>

#### Returns

`void`
