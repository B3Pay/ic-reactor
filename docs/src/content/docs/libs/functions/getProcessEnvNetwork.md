---
title: getProcessEnvNetwork
editUrl: false
next: true
prev: true
---

> **getProcessEnvNetwork**(): `string`

Defined in: [core/src/utils/helper.ts:39](https://github.com/B3Pay/ic-reactor/blob/f326971626a10001cc3bcf63e489ae66bc32d07c/packages/core/src/utils/helper.ts#L39)

Retrieves the network from the process environment variables.

Honors both legacy `DFX_NETWORK` (dfx) and `ICP_NETWORK` (icp-cli),
with `ICP_NETWORK` taking precedence when both are set.

## Returns

`string`

The network name, defaulting to "ic" if not specified.
