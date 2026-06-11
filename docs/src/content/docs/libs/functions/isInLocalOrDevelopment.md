---
title: isInLocalOrDevelopment
editUrl: false
next: true
prev: true
---

> **isInLocalOrDevelopment**(): `boolean`

Defined in: [core/src/utils/helper.ts:26](https://github.com/B3Pay/ic-reactor/blob/dd1564327ead262e28427c903394d431f5640b11/packages/core/src/utils/helper.ts#L26)

Checks if the current environment is local or development.

Honors both legacy `DFX_NETWORK` (dfx) and `ICP_NETWORK` (icp-cli).

## Returns

`boolean`

`true` if running in a local or development environment, otherwise `false`.
