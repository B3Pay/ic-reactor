---
title: processQueryCallResponse
editUrl: false
next: true
prev: true
---

> **processQueryCallResponse**(`response`, `canisterId`, `methodName`): `Uint8Array`

Defined in: [core/src/utils/agent.ts:38](https://github.com/B3Pay/ic-reactor/blob/f2661cd553b5412c8701b0ccea86db799d335543/packages/core/src/utils/agent.ts#L38)

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
