---
title: AuthClientLoader
editUrl: false
next: true
prev: true
---

Defined in: [auth/src/auth-client-loader.ts:21](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/auth/src/auth-client-loader.ts#L21)

Lazily loads the optional `@icp-sdk/auth` client constructor via dynamic
import and remembers whether the module is unavailable.

Keeping the dynamic-import concern isolated lets [AuthenticationManager](AuthenticationManager.md)
focus on the sign-in flow instead of module-resolution bookkeeping.

## Example

```ts
const loader = new AuthClientLoader()
const AuthClient = await loader.load()
const client = AuthClient ? new AuthClient() : undefined
```

## Constructors

### Constructor

> **new AuthClientLoader**(): `AuthClientLoader`

#### Returns

`AuthClientLoader`

## Accessors

### isModuleMissing

#### Get Signature

> **get** **isModuleMissing**(): `boolean`

Defined in: [auth/src/auth-client-loader.ts:27](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/auth/src/auth-client-loader.ts#L27)

True once a load attempt has failed because the module is unavailable.

##### Returns

`boolean`

---

### cachedConstructor

#### Get Signature

> **get** **cachedConstructor**(): [`AuthClientConstructor`](../type-aliases/AuthClientConstructor.md) \| `undefined`

Defined in: [auth/src/auth-client-loader.ts:32](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/auth/src/auth-client-loader.ts#L32)

The already-resolved constructor, if [load](#load) has completed.

##### Returns

[`AuthClientConstructor`](../type-aliases/AuthClientConstructor.md) \| `undefined`

## Methods

### load()

> **load**(): `Promise`\<[`AuthClientConstructor`](../type-aliases/AuthClientConstructor.md) \| `undefined`\>

Defined in: [auth/src/auth-client-loader.ts:42](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/auth/src/auth-client-loader.ts#L42)

Dynamically import and cache the `AuthClient` constructor.

#### Returns

`Promise`\<[`AuthClientConstructor`](../type-aliases/AuthClientConstructor.md) \| `undefined`\>

The constructor, or `undefined` when the module is missing.

#### Throws

If the module loads but does not export `AuthClient`.
