---
title: processQueryCallResponse
editUrl: false
next: true
prev: true
---

> **processQueryCallResponse**(`response`, `canisterId`, `methodName`): `Uint8Array`

Defined in: [core/src/utils/agent.ts:38](https://github.com/B3Pay/ic-reactor/blob/48543b681c4ca8e8beeffe45135260b8c3c245d5/packages/core/src/utils/agent.ts#L38)

Process a query call response following the exact logic from @icp-sdk/core/agent Actor.

## Parameters

### response

`ApiQueryResponse`

The query call response options

### canisterId

`Principal`

### methodName

`string`

## Returns

`Uint8Array`

The raw reply bytes

## Throws

CallError if the query was rejected
