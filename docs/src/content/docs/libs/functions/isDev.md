---
title: isDev
editUrl: false
next: true
prev: true
---

> **isDev**(): `boolean`

Defined in: [utils/helper.ts:38](https://github.com/B3Pay/ic-reactor/blob/19301fd54c59786a0db96c42a8e480ee185a81be/packages/core/src/utils/helper.ts#L38)

Detect whether the runtime should be considered _development_.

Checks in order:

- `import.meta.env?.DEV` (Vite / ESM environments)
- `process.env.NODE_ENV === 'development'` (Node)
- `process.env.DFX_NETWORK === 'local'` (local IC replica)

## Returns

`boolean`
