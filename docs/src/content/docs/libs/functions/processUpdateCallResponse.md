---
title: processUpdateCallResponse
editUrl: false
next: true
prev: true
---

> **processUpdateCallResponse**(`result`, `canisterId`, `methodName`, `agent`, `pollingOptions`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [utils/agent.ts:86](https://github.com/B3Pay/ic-reactor/blob/2aa323f4a71cd0eaae4326f58678668868380967/packages/core/src/utils/agent.ts#L86)

Process an update call response following the exact logic from @icp-sdk/core/agent Actor.

This handles:

- V4 responses with embedded certificate (sync call response)
- V2 responses with immediate rejection
- 202 responses that require polling

## Parameters

### result

`SubmitResponse`

The submit response from agent.call()

### canisterId

`Principal`

The target canister ID

### methodName

`string`

The method name being called

### agent

`HttpAgent`

The HTTP agent

### pollingOptions

`PollingOptions`

Options for polling

## Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

The raw reply bytes

## Throws

RejectError if the call was rejected

## Throws

UnknownError if the response format is unexpected
