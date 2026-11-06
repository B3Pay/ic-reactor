// Reading a canister's Candid from the IC, on any network the server is
// pointed at. The loader takes a `CandidSource`, so tests hand it a fake one
// and never touch the network.
import {
  Actor,
  AgentError,
  HttpAgent,
  HttpErrorCode,
  HttpFetchErrorCode,
  LookupPathStatus,
  RejectError,
  StatePaths,
  TrustError,
  type KnownPath,
  type ReadStateResponse,
} from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import type { InterfaceErrorCode } from "./types.ts"

/** Mainnet's API boundary nodes. */
export const MAINNET_HOST = "https://icp-api.io"

/** Each HTTP request to the IC gives up after this long. */
export const REQUEST_TIMEOUT_MS = 10_000

/**
 * Where a canister's Candid comes from. The agent-backed source reads the
 * IC; each method throws the agent's own errors, which `classifyReadError`
 * sorts into the loader's error codes.
 */
export interface CandidSource {
  /**
   * One certified `read_state` of `candid:service` and `module_hash`: a
   * `null` value means the certificate proves the path absent (no such
   * metadata section, or no module installed). A path the certificate
   * neither shows nor proves absent throws an `UnprovenPathError`.
   */
  readCandidAndHash(canisterId: string): Promise<{
    did: string | null
    moduleHash: Uint8Array | null
  }>
  /** A certified `read_state` of `module_hash` alone, read the same way. */
  readModuleHash(canisterId: string): Promise<Uint8Array | null>
  /**
   * The canister's `__get_candid_interface_tmp_hack` query: the answer of
   * one replica, not certified.
   */
  readTmpHack(canisterId: string): Promise<string>
}

/**
 * A path a verified certificate leaves unproven: its tree holds neither the
 * value nor a proof that there is none, only a pruned branch. An honest
 * replica answers every path it was asked; a party between it and the
 * server (a boundary node) can prune a genuine certificate without breaking
 * its signature. `classifyReadError` reports it as `trust_error`, so the
 * loader never takes it for an absence and falls back.
 */
export class UnprovenPathError extends Error {
  override name = "UnprovenPathError"
}

/**
 * A `CandidSource` over an agent (`createReadAgent`). Paths are built from
 * the parsed principal, never from text.
 */
export function agentCandidSource(agent: HttpAgent): CandidSource {
  return {
    async readCandidAndHash(canisterId) {
      const id = Principal.fromText(canisterId)
      const candid = StatePaths.canisterCandid(id)
      const hash = StatePaths.canisterModuleHash(id)
      const response = await agent.readState(
        { canisterId: id },
        { paths: [candid, hash] }
      )
      return {
        did: provenValue(response, candid, "candid:service"),
        moduleHash: provenValue(response, hash, "module_hash"),
      }
    },
    async readModuleHash(canisterId) {
      const id = Principal.fromText(canisterId)
      const hash = StatePaths.canisterModuleHash(id)
      const response = await agent.readState(
        { canisterId: id },
        { paths: [hash] }
      )
      return provenValue(response, hash, "module_hash")
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

// The value at `path`, `null` only when the certificate proves it absent.
// The agent's `values` map gives null for an unproven path too, so this
// asks the verified certificate itself.
function provenValue<T>(
  response: ReadStateResponse,
  path: KnownPath<T>,
  label: string
): T | null {
  const found = response.verifiedCertificate.lookup_path(path.path)
  switch (found.status) {
    case LookupPathStatus.Found:
      return path.decode(found.value)
    case LookupPathStatus.Absent:
      return null
    default:
      throw new UnprovenPathError(
        `The certificate neither shows nor rules out the canister's ${label}.`
      )
  }
}

export interface ReadAgentOptions {
  readonly host: string
  /** The root key every certificate is checked against; mainnet's when absent and not fetched. */
  readonly rootKey?: Uint8Array
  /** Fetch the root key from `host` (a replica on this machine only). */
  readonly fetchRootKey: boolean
}

/**
 * The agent the loader reads with: anonymous, for `host`, every request
 * bounded by `REQUEST_TIMEOUT_MS`, and `retryTimes: 0`. HttpAgent otherwise
 * re-sends every non-2xx response (a 403 or a `canister_not_found` too)
 * three times with backoff, which turns each miss into 3 to 5 seconds.
 *
 * Every certificate is verified against `rootKey` when it is given (it wins
 * over `fetchRootKey`), else against the key `host` serves when
 * `fetchRootKey` is set (fetched here, once: this rejects when it cannot
 * be), else against the mainnet root key the agent has built in.
 */
export async function createReadAgent(
  options: ReadAgentOptions
): Promise<HttpAgent> {
  const fetchKey = options.rootKey === undefined && options.fetchRootKey
  const agent = HttpAgent.createSync({
    host: options.host,
    retryTimes: 0,
    fetch: boundedFetch,
    ...(options.rootKey === undefined
      ? { shouldFetchRootKey: fetchKey }
      : { rootKey: options.rootKey }),
  })
  if (fetchKey) {
    try {
      await agent.fetchRootKey()
    } catch (error) {
      throw new Error(
        `Fetching the root key from ${options.host} failed: ${agentMessage(error)}`,
        { cause: error }
      )
    }
  }
  return agent
}

const boundedFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal =
    init?.signal != null ? AbortSignal.any([init.signal, timeout]) : timeout
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
 * certificate or signature that did not verify) and an `UnprovenPathError`
 * are always `trust_error`, at every stage, so the loader never falls back
 * past them. A 403 at the metadata stage is `private`: it is not signed,
 * so it only ever leads to the labelled, uncertified tmp hack.
 */
export function classifyReadError(error: unknown, stage: ReadStage): ReadError {
  if (error instanceof TrustError || error instanceof UnprovenPathError) {
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
        message: "No canister has this id on the network the server reads.",
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
