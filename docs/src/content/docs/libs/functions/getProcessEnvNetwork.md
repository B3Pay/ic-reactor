---
editUrl: false
next: true
prev: true
---

> **getProcessEnvNetwork**(): `string`

Defined in: [core/src/utils/helper.ts:33](https://github.com/B3Pay/ic-reactor/blob/c30ea0ec26d4e0252f1f93b6c3cd13fbc42ece15/packages/core/src/utils/helper.ts#L33)

Retrieves the network from the process environment variables.

Honors both legacy `DFX_NETWORK` (dfx) and `ICP_NETWORK` (icp-cli),
with `ICP_NETWORK` taking precedence when both are set.

## Returns

`string`

The network name, defaulting to "ic" if not specified.
