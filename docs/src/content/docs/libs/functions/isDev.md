---
title: isDev
editUrl: false
next: true
prev: true
---

> **isDev**(): `boolean`

Defined in: [core/src/utils/helper.ts:47](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/utils/helper.ts#L47)

Detect whether the runtime should be considered _development_.

Checks in order:

- `import.meta.env?.DEV` (Vite / ESM environments)
- `process.env.NODE_ENV === 'development'` (Node)
- `process.env.DFX_NETWORK === 'local'` (dfx local replica)
- `process.env.ICP_NETWORK === 'local'` (icp-cli local network)

## Returns

`boolean`
