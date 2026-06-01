---
title: isInLocalOrDevelopment
editUrl: false
next: true
prev: true
---

> **isInLocalOrDevelopment**(): `boolean`

Defined in: [core/src/utils/helper.ts:18](https://github.com/B3Pay/ic-reactor/blob/bd27de26eba8528344acc954f6dcf2ef41cd24f1/packages/core/src/utils/helper.ts#L18)

Checks if the current environment is local or development.

Honors both legacy `DFX_NETWORK` (dfx) and `ICP_NETWORK` (icp-cli).

## Returns

`boolean`

`true` if running in a local or development environment, otherwise `false`.
