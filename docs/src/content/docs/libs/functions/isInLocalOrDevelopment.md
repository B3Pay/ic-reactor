---
title: isInLocalOrDevelopment
editUrl: false
next: true
prev: true
---

> **isInLocalOrDevelopment**(): `boolean`

Defined in: [core/src/utils/helper.ts:26](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/utils/helper.ts#L26)

Checks if the current environment is local or development.

Honors both legacy `DFX_NETWORK` (dfx) and `ICP_NETWORK` (icp-cli).

## Returns

`boolean`

`true` if running in a local or development environment, otherwise `false`.
