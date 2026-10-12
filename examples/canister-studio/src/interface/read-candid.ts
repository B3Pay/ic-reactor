// Reading a live canister's Candid from mainnet, on the server or in the
// browser. The loader takes a `CandidSource`, so tests hand it a fake one and
// never touch the network.
import {
  Actor,
  AgentError,
  HttpAgent,
  HttpErrorCode,
  HttpFetchErrorCode,
  RejectError,
  StatePaths,
  TrustError,
} from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import type { InterfaceErrorCode } from "./types.ts"

/**
 * The one host the studio reads interfaces from: mainnet's API boundary
 * nodes. No URL is ever built from user input; a canister id only goes into
 * the request path, after `checkCanisterId` accepted it.
 */
export const IC_API_HOST = "https://icp-api.io"

/** Each HTTP request to the IC gives up after this long. */
const REQUEST_TIMEOUT_MS = 10_000

/**
 * Where a canister's Candid comes from. The agent-backed source reads
 * mainnet; each method throws the agent's own errors, which
 * `classifyReadError` sorts into the loader's error codes.
 */
export interface CandidSource {
  /**
   * One certified `read_state` of `candid:service` and `module_hash`: a
   * `null` value means the certificate proves the path absent (no such
   * metadata section, or no module installed).
   */
  readCandidAndHash(canisterId: string): Promise<{
    did: string | null
    moduleHash: Uint8Array | null
  }>
  /** A certified `read_state` of `module_hash` alone. */
  readModuleHash(canisterId: string): Promise<Uint8Array | null>
  /**
   * The canister's `__get_candid_interface_tmp_hack` query: the answer of
   * one replica, not certified.
   */
  readTmpHack(canisterId: string): Promise<string>
}

/** A `CandidSource` over an agent. Paths are built from the parsed principal. */
export function agentCandidSource(agent: HttpAgent): CandidSource {
  return {
    async readCandidAndHash(canisterId) {
      const id = Principal.fromText(canisterId)
      const candid = StatePaths.canisterCandid(id)
      const hash = StatePaths.canisterModuleHash(id)
      const { values } = await agent.readState(
        { canisterId: id },
        { paths: [candid, hash] }
      )
      return { did: values.get(candid), moduleHash: values.get(hash) }
    },
    async readModuleHash(canisterId) {
      const id = Principal.fromText(canisterId)
      const hash = StatePaths.canisterModuleHash(id)
      const { values } = await agent.readState(
        { canisterId: id },
        { paths: [hash] }
      )
      return values.get(hash)
    },
    async readTmpHack(canisterId) {
      const service = Actor.createActor<{
        __get_candid_interface_tmp_hack: () => Promise<string>
      }>(
        ({ IDL: idl }) =>
          idl.Service({
            __get_candid_interface_tmp_hack: idl.Func(
              [],
              [idl.Text],
              ["query"]
            ),
          }),
        { agent, canisterId }
      )
      return service.__get_candid_interface_tmp_hack()
    },
  }
}

/**
 * The agent the loader reads metadata with: mainnet, anonymous, the
 * hard-coded mainnet root key (every certificate is verified against it),
 * and `retryTimes: 0`. HttpAgent otherwise re-sends every non-2xx response
 * (a 403 or a `canister_not_found` too) three times with backoff, which
 * turns each miss into 3 to 5 seconds.
 */
export function createMetadataAgent(): HttpAgent {
  return HttpAgent.createSync({
    host: IC_API_HOST,
    retryTimes: 0,
    fetch: boundedFetch,
  })
}

const boundedFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal =
    init?.signal != null && typeof AbortSignal.any === "function"
      ? AbortSignal.any([init.signal, timeout])
      : timeout
  return fetch(input, { ...init, signal })
}

/** Which read failed, for `classifyReadError`. */
export type ReadStage = "metadata" | "module_hash" | "tmp_hack"

/** A read failure, sorted into what the loader does next. */
export type ReadError =
  /** `candid:service` is readable by the canister's controllers only. */
  | { kind: "private" }
  /** The tmp hack query was rejected: the canister has no such method. */
  | { kind: "no_tmp_hack" }
  | { kind: "failed"; code: InterfaceErrorCode; message: string }

/**
 * Sorts an error thrown by a `CandidSource` read. A `TrustError` (a
 * certificate or signature that did not verify) is always `trust_error`,
 * at every stage, so the loader never falls back past it.
 */
export function classifyReadError(error: unknown, stage: ReadStage): ReadError {
  if (error instanceof TrustError) {
    return {
      kind: "failed",
      code: "trust_error",
      message: `The IC's answer did not verify, so it was not used: ${agentMessage(error)}`,
    }
  }
  if (error instanceof AgentError && error.code instanceof HttpErrorCode) {
    const { status, bodyText = "" } = error.code
    if (status === 403 && stage === "metadata") return { kind: "private" }
    if (status === 400 && bodyText.includes("canister_not_found")) {
      return {
        kind: "failed",
        code: "canister_not_found",
        message: "No canister has this id on mainnet.",
      }
    }
    return {
      kind: "failed",
      code: "network",
      message: `The IC answered HTTP ${status}: ${bodyText.slice(0, 200) || error.code.statusText}`,
    }
  }
  if (stage === "tmp_hack" && error instanceof RejectError) {
    return { kind: "no_tmp_hack" }
  }
  if (isRequestTimeout(error)) {
    return {
      kind: "failed",
      code: "timeout",
      message: `The IC did not answer within ${REQUEST_TIMEOUT_MS / 1000} s.`,
    }
  }
  return {
    kind: "failed",
    code: "network",
    message: `Reading the interface failed: ${agentMessage(error)}`,
  }
}

// The agent wraps a failed fetch, so the abort of `boundedFetch` arrives as
// an HttpFetchErrorCode holding the TimeoutError.
function isRequestTimeout(error: unknown): boolean {
  const cause =
    error instanceof AgentError && error.code instanceof HttpFetchErrorCode
      ? error.code.error
      : error
  // A DOMException, which is not an Error subclass in every runtime.
  return (
    typeof cause === "object" &&
    cause !== null &&
    Reflect.get(cause, "name") === "TimeoutError"
  )
}

function agentMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.split("\n")[0]?.slice(0, 200) ?? ""
}
