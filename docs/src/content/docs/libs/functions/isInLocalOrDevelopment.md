---
title: isInLocalOrDevelopment
editUrl: false
next: true
prev: true
---

> **isInLocalOrDevelopment**(): `boolean`

Defined in: [core/src/utils/helper.ts:26](https://github.com/B3Pay/ic-reactor/blob/43338f9341f1c13fd8c765762d4f814c0239a271/packages/core/src/utils/helper.ts#L26)

Checks if the current environment is local or development.

Honors both legacy `DFX_NETWORK` (dfx) and `ICP_NETWORK` (icp-cli).

## Returns

`boolean`

`true` if running in a local or development environment, otherwise `false`.
