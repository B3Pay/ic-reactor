---
title: createPollingStrategy
editUrl: false
next: true
prev: true
---

> **createPollingStrategy**(`cfg?`): `PollStrategy`

Defined in: [utils/polling.ts:191](https://github.com/B3Pay/ic-reactor/blob/31379e9c6e4bae3777010b2d35287763d1a80af6/packages/core/src/utils/polling.ts#L191)

Creates an polling strategy for Internet Computer agent update calls.

The strategy implements three phases:

1. **Fast Phase**: Initial rapid polling (default: 10 attempts @ 100ms intervals)
2. **Ramp Phase**: Exponential backoff growth (default: up to 20s elapsed)
3. **Plateau Phase**: Steady-state polling (default: 5s intervals)

The strategy continues polling while request status is RECEIVED/PROCESSING,
and only terminates on REPLIED/REJECTED/DONE status or when aborted.

## Parameters

### cfg?

[`PollingConfig`](../interfaces/PollingConfig.md) = `{}`

Configuration options

## Returns

`PollStrategy`

- Async strategy function compatible with agent pollingOptions.strategy

## Example

```typescript
// Basic usage
const strategy = createPollingStrategy()

// Custom configuration for long-running operations
const strategy = createPollingStrategy({
  context: "blockchain-sync",
  fastAttempts: 5,
  fastDelayMs: 200,
  rampUntilMs: 30_000,
  plateauDelayMs: 10_000,
  jitterRatio: 0.3,
})

// With abort signal
const controller = new AbortController()
const strategy = createPollingStrategy({
  context: "transaction-signing",
  abortSignal: controller.signal,
})
// Later: controller.abort();
```

## Throws

When abortSignal is triggered during polling
