/**
 * @module polling
 * @description
 * Polling strategy for Internet Computer (Dfinity) agent update calls.
 *
 * This module provides a configurable, intelligent polling mechanism that:
 * - Starts with rapid polling for quick responses (fast phase)
 * - Gradually increases delay intervals (ramp phase)
 * - Settles into steady-state polling (plateau phase)
 * - Adds jitter to prevent thundering herd problems
 * - Provides structured logging with elapsed time and status
 * - Supports graceful cancellation via AbortSignal
 * - Gives up on a request after `timeoutMs` (5 minutes by default)
 * - Tracks each request on its own, so one strategy can serve every update call
 *
 * @example
 * ```typescript
 * const strategy = createPollingStrategy({
 *   context: "signer-creation",
 *   fastAttempts: 10,
 *   plateauDelayMs: 5000
 * });
 *
 * const result = await actor.createSigner(params, {
 *   pollingOptions: { strategy }
 * });
 * ```
 */

import {
  PollStrategy,
  ProtocolError,
  RequestId,
  RequestStatusResponseStatus,
  TargetPrincipal,
  TimeoutWaitingForResponseErrorCode,
} from "@icp-sdk/core/agent"
import { uint8ArrayToHex } from "./helper.js"

/** The SDK's `defaultStrategy()` gives up on a request after five minutes. */
const DEFAULT_TIMEOUT_MS = 5 * 60_000

/**
 * How long a request may go without polling, beyond the longest sleep the
 * strategy can schedule, before it is taken as finished and forgotten.
 */
const FORGET_QUIET_REQUEST_MS = 5 * 60_000

/** What the strategy keeps about one request between its polls. */
interface RequestState {
  /** Polls so far, the current one included. */
  attempt: number
  /** When the request's first poll arrived. */
  start: number
  /** When the request last polled. */
  lastPoll: number
  /** When a line was last logged for the request. */
  lastLog: number
}

export interface PollingConfig {
  /**
   * Logical operation name used in log messages for identifying the polling context.
   *
   * Used to distinguish between different polling operations in console output.
   * Choose descriptive names that help with debugging and monitoring.
   *
   * @default "operation"
   * @example "sign-transaction", "document-upload"
   */
  context?: string

  /**
   * Custom prefix prepended to all log messages from this polling strategy.
   *
   * Allows filtering and identifying logs specific to this polling instance.
   * Useful when running multiple polling operations concurrently.
   *
   * @default "[Polling]"
   * @example "[PaymentPolling]", "[TransactionPolling]", "[SignerPolling]"
   */
  logPrefix?: string

  /**
   * Number of initial rapid polling attempts before transitioning to ramp phase.
   *
   * During fast phase, polls occur at `fastDelayMs` intervals (plus jitter).
   * Higher values = more aggressive initial polling for fast responses.
   * Lower values = faster transition to exponential backoff.
   *
   * @default 10
   * @example 5 (for slower operations), 15 (for very fast operations)
   */
  fastAttempts?: number

  /**
   * Base delay in milliseconds between polls during the fast phase.
   *
   * This is the baseline interval before jitter is applied.
   * Actual delay will vary by ±`jitterRatio` percentage.
   * Lower values = more aggressive polling, higher network load.
   *
   * @default 100
   * @example 50 (aggressive), 200 (conservative)
   */
  fastDelayMs?: number

  /**
   * Duration threshold in milliseconds for the ramp phase.
   *
   * While elapsed time < rampUntilMs, delay grows exponentially from
   * `fastDelayMs` up to `plateauDelayMs` using a power curve (0.7 exponent).
   * After this duration, polling enters plateau phase with constant delays.
   *
   * @default 20000 (20 seconds)
   * @example 10_000 (faster transition), 30_000 (longer ramp for slow ops)
   */
  rampUntilMs?: number

  /**
   * Steady-state polling delay in milliseconds during plateau phase.
   *
   * Once ramp phase completes, all subsequent polls use this interval (plus jitter).
   * This is the "cruise speed" for long-running operations.
   * Balance between responsiveness and network/resource efficiency.
   *
   * @default 5000 (5 seconds)
   * @example 2_000 (more responsive), 10_000 (more efficient)
   */
  plateauDelayMs?: number

  /**
   * Randomization ratio (0-1) for adding jitter to prevent thundering herd.
   *
   * Jitter adds ±(ratio * delay) randomness to each polling interval.
   * Higher values = more randomization, better distribution across time.
   * Lower values = more predictable intervals, less variance.
   * Prevents synchronized polling when multiple clients start simultaneously.
   *
   * @default 0.4 (±40% randomization)
   * @example 0.2 (±20%, less jitter), 0.5 (±50%, more jitter)
   */
  jitterRatio?: number

  /**
   * Maximum time in milliseconds between log outputs (heartbeat interval).
   *
   * Forces a log message if this much time passes without logging,
   * even if normal log throttling would suppress it.
   * Prevents "silent" long-running operations; ensures monitoring visibility.
   *
   * @default 15000 (15 seconds)
   * @example 10_000 (more frequent heartbeats), 30_000 (less verbose)
   */
  maxLogIntervalMs?: number

  /**
   * Longest time in milliseconds a single request is polled, counted from the
   * first poll that finds it still pending.
   *
   * Once it has passed, the next poll throws the SDK's own timeout error (a
   * `ProtocolError` with `TimeoutWaitingForResponseErrorCode`, as
   * `defaultStrategy()` throws), which ends the polling and fails the call.
   * Without a limit, a request the network never picked up stays `unknown`
   * and is polled for as long as the page is open.
   *
   * A call that times out can still complete: a request the canister already
   * received keeps running there. Check for its effect before retrying a call
   * that must not run twice.
   *
   * Each request has its own limit, so a strategy shared by many calls never
   * runs out. Pass `Infinity` to poll until the request settles or
   * `abortSignal` fires.
   *
   * @default 300000 (5 minutes, the SDK's `defaultStrategy()` limit)
   * @example 60_000 (fail faster), Infinity (no limit)
   */
  timeoutMs?: number

  /**
   * External abort signal for graceful cancellation of polling operation.
   *
   * When the signal is aborted, the polling strategy throws an error
   * on the next poll attempt. Use AbortController to create signals.
   * Allows coordinated cancellation across multiple async operations.
   * The signal stops every request this strategy polls; to cancel a single
   * call, give that call a strategy of its own.
   *
   * @default undefined (no external cancellation)
   * @example
   * ```typescript
   * const controller = new AbortController();
   * const strategy = createPollingStrategy({
   *   abortSignal: controller.signal
   * });
   * // Later: controller.abort();
   * ```
   */
  abortSignal?: AbortSignal
}

/**
 * Creates an polling strategy for Internet Computer agent update calls.
 *
 * The strategy implements three phases:
 * 1. **Fast Phase**: Initial rapid polling (default: 10 attempts @ 100ms intervals)
 * 2. **Ramp Phase**: Exponential backoff growth (default: up to 20s elapsed)
 * 3. **Plateau Phase**: Steady-state polling (default: 5s intervals)
 *
 * The strategy continues polling while request status is RECEIVED/PROCESSING,
 * and terminates on REPLIED/REJECTED/DONE status, when aborted, or once the
 * request has been polled for `timeoutMs`.
 *
 * One strategy can be shared, for example by every update call of a reactor
 * through its `pollingOptions`. Each request, told apart by its request ID,
 * gets its own attempt count, clock and timeout, so a call that starts later
 * still begins in the fast phase.
 *
 * @param {PollingConfig} [cfg={}] - Configuration options
 * @returns {PollStrategy} - Async strategy function compatible with agent pollingOptions.strategy
 *
 * @example
 * ```typescript
 * // Basic usage
 * const strategy = createPollingStrategy();
 *
 * // Custom configuration for long-running operations
 * const strategy = createPollingStrategy({
 *   context: "blockchain-sync",
 *   fastAttempts: 5,
 *   fastDelayMs: 200,
 *   rampUntilMs: 30_000,
 *   plateauDelayMs: 10_000,
 *   jitterRatio: 0.3
 * });
 *
 * // With abort signal
 * const controller = new AbortController();
 * const strategy = createPollingStrategy({
 *   context: "transaction-signing",
 *   abortSignal: controller.signal
 * });
 * // Later: controller.abort();
 * ```
 *
 * @throws {Error} When abortSignal is triggered during polling
 * @throws {ProtocolError} With `TimeoutWaitingForResponseErrorCode` when a
 * request has been polled for `timeoutMs`
 */
export function createPollingStrategy(cfg: PollingConfig = {}): PollStrategy {
  const {
    context = "operation",
    logPrefix = "[Polling]",
    fastAttempts = 10,
    fastDelayMs = 100,
    rampUntilMs = 20_000,
    plateauDelayMs = 5_000,
    jitterRatio = 0.4,
    maxLogIntervalMs = 15_000,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    abortSignal,
  } = cfg

  /**
   * Each request's state, keyed by its request ID in hex. The agent passes the
   * same request ID on every poll of a request, and a new one for every call.
   */
  const requests = new Map<string, RequestState>()

  /**
   * The agent stops calling the strategy once a request settles and never
   * says so, so a request that has not polled for this long is taken as
   * finished. Jitter at most doubles a delay; the rest leaves room for a slow
   * read_state (the agent retries failed reads), so a request that is still
   * being polled is never forgotten.
   */
  const forgetAfterMs =
    2 * Math.max(fastDelayMs, plateauDelayMs) + FORGET_QUIET_REQUEST_MS

  /**
   * Returns the state of the request polling now, starting it on the
   * request's first poll, and forgets requests that have gone quiet.
   */
  const track = (key: string, now: number): RequestState => {
    // Map iteration follows insertion order and every poll re-inserts its
    // request, so the quietest requests come first and the sweep can stop at
    // the first one that is still active.
    for (const [quietKey, quiet] of requests) {
      if (now - quiet.lastPoll <= forgetAfterMs) break
      requests.delete(quietKey)
    }

    const state = requests.get(key) ?? {
      attempt: 0,
      start: now,
      lastPoll: now,
      lastLog: 0,
    }
    requests.delete(key)
    requests.set(key, state)
    state.lastPoll = now
    return state
  }

  /**
   * Structured logging function that outputs polling state information.
   * Implements intelligent log throttling to prevent console spam while ensuring
   * periodic heartbeat logs for long-running operations.
   *
   * @param {RequestState} state - The polling request's state
   * @param {string} key - The polling request's ID in hex
   * @param {string} phase - Current polling phase ("fast", "ramp", or "plateau")
   * @param {string | undefined} statusKind - Request status from IC agent
   * @param {number} nextDelay - Calculated delay until next poll (ms)
   */
  const log = (
    state: RequestState,
    key: string,
    phase: string,
    statusKind: string | undefined,
    nextDelay: number
  ) => {
    const now = Date.now()
    // Suppress ultra-noisy logs: skip if < 1s since last log and not in fast phase
    if (now - state.lastLog < 1_000 && phase !== "fast" && nextDelay < 1_000)
      return

    // Force a heartbeat log if too much time has passed (prevents silent operations)
    if (now - state.lastLog > maxLogIntervalMs) {
      phase += "+heartbeat"
    }

    state.lastLog = now

    // Requests polling at the same time log in between each other, so each
    // line names its request by the first 8 hex digits of its ID.
    console.info(
      `${logPrefix} ${context} request=${key.slice(0, 8)} attempt=${state.attempt} elapsed=${now - state.start}ms status=${statusKind} phase=${phase} nextDelay=${Math.round(nextDelay)}ms`
    )
  }

  /**
   * Computes the next polling delay based on elapsed time and attempt count.
   * Implements three-phase strategy:
   * - Fast: Initial rapid polling
   * - Ramp: Exponential growth with power curve
   * - Plateau: Steady-state polling
   *
   * @param {number} elapsed - Milliseconds elapsed since start
   * @param {number} a - Current attempt number
   * @returns {{ delay: number; phase: string }} - Calculated delay and phase name
   */
  const computeDelay = (
    elapsed: number,
    a: number
  ): { delay: number; phase: string } => {
    // Phase 1: Fast initial polling
    if (a < fastAttempts) {
      return { delay: withJitter(fastDelayMs), phase: "fast" }
    }

    // Phase 2: Ramp with exponential growth (power curve 0.7 for smooth acceleration)
    if (elapsed < rampUntilMs) {
      const progress = elapsed / rampUntilMs // Normalized progress: 0..1
      const base =
        fastDelayMs + (plateauDelayMs - fastDelayMs) * Math.pow(progress, 0.7)
      return { delay: withJitter(base), phase: "ramp" }
    }

    // Phase 3: Plateau - steady-state polling
    return { delay: withJitter(plateauDelayMs), phase: "plateau" }
  }

  /**
   * Applies random jitter to prevent synchronized polling across multiple clients.
   * Uses configured jitterRatio to add ±N% randomness to the base delay.
   *
   * @param {number} base - Base delay in milliseconds
   * @returns {number} - Jittered delay, minimum 50ms
   */
  const withJitter = (base: number): number => {
    const spread = base * jitterRatio
    return Math.max(50, base - spread + Math.random() * spread * 2)
  }

  /**
   * Async strategy function invoked by the IC agent on each polling cycle.
   * Determines whether to continue waiting based on request status.
   *
   * @param {TargetPrincipal} _effectiveTarget - Target canister or subnet (unused but required by interface)
   * @param {RequestId} requestId - Request identifier; keys the request's own state
   * @param {RequestStatusResponseStatus} [rawStatus] - Current request status from IC
   * @returns {Promise<void>} - Resolves after calculated delay, or immediately for terminal states
   * @throws {Error} - If abortSignal is triggered
   * @throws {ProtocolError} - If the request has been polled for `timeoutMs`
   */
  return async function strategy(
    _effectiveTarget: TargetPrincipal,
    requestId: RequestId,
    rawStatus?: RequestStatusResponseStatus
  ): Promise<void> {
    const key = uint8ArrayToHex(requestId)

    // Check for external cancellation
    if (abortSignal?.aborted) {
      requests.delete(key)
      throw new Error(`${context} polling aborted`)
    }

    const statusKind = rawStatus

    // Terminal states: Stop polling immediately
    // - Replied: Request completed successfully
    // - Rejected: Request was rejected by canister
    // - Done: Request processing complete
    // Note: Agent typically stops before we reach here, but we handle defensively
    if (
      statusKind === RequestStatusResponseStatus.Replied ||
      statusKind === RequestStatusResponseStatus.Rejected ||
      statusKind === RequestStatusResponseStatus.Done
    ) {
      requests.delete(key)
      return
    }

    // Continue polling for:
    // - Received: Request received but not yet processed
    // - Processing: Request is being processed
    // - Unknown: Status not yet available
    // - undefined: No status information yet
    const now = Date.now()
    const state = track(key, now)
    state.attempt++

    const elapsed = now - state.start
    if (elapsed >= timeoutMs) {
      // Throwing is how a strategy ends the agent's poll loop.
      requests.delete(key)
      throw ProtocolError.fromCode(
        new TimeoutWaitingForResponseErrorCode(
          `${context} polling timed out after ${timeoutMs} msec`,
          requestId,
          rawStatus
        )
      )
    }

    const { delay, phase } = computeDelay(elapsed, state.attempt)
    log(state, key, phase, statusKind, delay)

    // Sleep for calculated delay before next poll
    await new Promise((r) => setTimeout(r, delay))
  }
}
