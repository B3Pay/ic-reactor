---
title: PollingConfig
editUrl: false
next: true
prev: true
---

Defined in: [utils/polling.ts:35](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/polling.ts#L35)

## Properties

### context?

> `optional` **context**: `string`

Defined in: [utils/polling.ts:45](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/polling.ts#L45)

Logical operation name used in log messages for identifying the polling context.

Used to distinguish between different polling operations in console output.
Choose descriptive names that help with debugging and monitoring.

#### Default

```ts
"operation"
```

#### Example

```ts
;("sign-transaction", "document-upload")
```

---

### logPrefix?

> `optional` **logPrefix**: `string`

Defined in: [utils/polling.ts:56](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/polling.ts#L56)

Custom prefix prepended to all log messages from this polling strategy.

Allows filtering and identifying logs specific to this polling instance.
Useful when running multiple polling operations concurrently.

#### Default

```ts
"[Polling]"
```

#### Example

```ts
;("[PaymentPolling]", "[TransactionPolling]", "[SignerPolling]")
```

---

### fastAttempts?

> `optional` **fastAttempts**: `number`

Defined in: [utils/polling.ts:68](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/polling.ts#L68)

Number of initial rapid polling attempts before transitioning to ramp phase.

During fast phase, polls occur at `fastDelayMs` intervals (plus jitter).
Higher values = more aggressive initial polling for fast responses.
Lower values = faster transition to exponential backoff.

#### Default

```ts
10
```

#### Example

```ts
5 (for slower operations), 15 (for very fast operations)
```

---

### fastDelayMs?

> `optional` **fastDelayMs**: `number`

Defined in: [utils/polling.ts:80](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/polling.ts#L80)

Base delay in milliseconds between polls during the fast phase.

This is the baseline interval before jitter is applied.
Actual delay will vary by ±`jitterRatio` percentage.
Lower values = more aggressive polling, higher network load.

#### Default

```ts
100
```

#### Example

```ts
;(50(aggressive), 200(conservative))
```

---

### rampUntilMs?

> `optional` **rampUntilMs**: `number`

Defined in: [utils/polling.ts:92](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/polling.ts#L92)

Duration threshold in milliseconds for the ramp phase.

While elapsed time < rampUntilMs, delay grows exponentially from
`fastDelayMs` up to `plateauDelayMs` using a power curve (0.7 exponent).
After this duration, polling enters plateau phase with constant delays.

#### Default

```ts
20000 (20 seconds)
```

#### Example

```ts
10_000 (faster transition), 30_000 (longer ramp for slow ops)
```

---

### plateauDelayMs?

> `optional` **plateauDelayMs**: `number`

Defined in: [utils/polling.ts:104](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/polling.ts#L104)

Steady-state polling delay in milliseconds during plateau phase.

Once ramp phase completes, all subsequent polls use this interval (plus jitter).
This is the "cruise speed" for long-running operations.
Balance between responsiveness and network/resource efficiency.

#### Default

```ts
5000 (5 seconds)
```

#### Example

```ts
2_000 (more responsive), 10_000 (more efficient)
```

---

### jitterRatio?

> `optional` **jitterRatio**: `number`

Defined in: [utils/polling.ts:117](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/polling.ts#L117)

Randomization ratio (0-1) for adding jitter to prevent thundering herd.

Jitter adds ±(ratio \* delay) randomness to each polling interval.
Higher values = more randomization, better distribution across time.
Lower values = more predictable intervals, less variance.
Prevents synchronized polling when multiple clients start simultaneously.

#### Default

```ts
0.4 (±40% randomization)
```

#### Example

```ts
0.2 (±20%, less jitter), 0.5 (±50%, more jitter)
```

---

### maxLogIntervalMs?

> `optional` **maxLogIntervalMs**: `number`

Defined in: [utils/polling.ts:129](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/polling.ts#L129)

Maximum time in milliseconds between log outputs (heartbeat interval).

Forces a log message if this much time passes without logging,
even if normal log throttling would suppress it.
Prevents "silent" long-running operations; ensures monitoring visibility.

#### Default

```ts
15000 (15 seconds)
```

#### Example

```ts
10_000 (more frequent heartbeats), 30_000 (less verbose)
```

---

### abortSignal?

> `optional` **abortSignal**: `AbortSignal`

Defined in: [utils/polling.ts:148](https://github.com/B3Pay/ic-reactor/blob/54730e94e191e004381d2aa1cc1c772e288b8460/packages/core/src/utils/polling.ts#L148)

External abort signal for graceful cancellation of polling operation.

When the signal is aborted, the polling strategy throws an error
on the next poll attempt. Use AbortController to create signals.
Allows coordinated cancellation across multiple async operations.

#### Default

```ts
undefined (no external cancellation)
```

#### Example

```typescript
const controller = new AbortController()
const strategy = createPollingStrategy({
  abortSignal: controller.signal,
})
// Later: controller.abort();
```
