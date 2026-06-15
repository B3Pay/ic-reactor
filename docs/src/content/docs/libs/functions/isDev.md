---
title: isDev
editUrl: false
next: true
prev: true
---

> **isDev**(): `boolean`

Defined in: [core/src/utils/helper.ts:53](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/utils/helper.ts#L53)

Detect whether the runtime should be considered _development_.

Checks in order:

- `import.meta.env?.DEV` (Vite / ESM environments)
- `process.env.NODE_ENV === 'development'` (Node)
- `process.env.DFX_NETWORK === 'local'` (dfx local replica)
- `process.env.ICP_NETWORK === 'local'` (icp-cli local network)

## Returns

`boolean`
