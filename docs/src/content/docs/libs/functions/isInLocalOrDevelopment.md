---
title: isInLocalOrDevelopment
editUrl: false
next: true
prev: true
---

> **isInLocalOrDevelopment**(): `boolean`

Defined in: [core/src/utils/helper.ts:26](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/utils/helper.ts#L26)

Checks if the current environment is local or development.

Honors both legacy `DFX_NETWORK` (dfx) and `ICP_NETWORK` (icp-cli).

## Returns

`boolean`

`true` if running in a local or development environment, otherwise `false`.
