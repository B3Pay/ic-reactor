import type {
  Agent,
  ApiQueryResponse,
  HttpDetailsResponse,
  Identity,
  PollingOptions,
  SubmitResponse,
  TargetPrincipal,
} from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"

import {
  isV2ResponseBody,
  isV4ResponseBody,
  Certificate,
  encodePath,
  lookupResultToBuffer,
  pollForResponse,
  QueryResponseStatus,
  UncertifiedRejectErrorCode,
  RejectError,
  UncertifiedRejectUpdateErrorCode,
  CertifiedRejectErrorCode,
  MissingRootKeyErrorCode,
  ExternalError,
  UnknownError,
  UnexpectedErrorCode,
} from "@icp-sdk/core/agent"

// ══════════════════════════════════════════════════════════════════════
// QUERY CALL RESPONSE PROCESSING
// ══════════════════════════════════════════════════════════════════════

/**
 * Process a query call response following the exact logic from @icp-sdk/core/agent Actor.
 *
 * @param response - The query call response options
 * @returns The raw reply bytes
 * @throws CallError if the query was rejected
 */
export function processQueryCallResponse(
  response: ApiQueryResponse,
  canisterId: Principal,
  methodName: string
): Uint8Array {
  const effectiveTarget = { canisterId }

  switch (response.status) {
    case QueryResponseStatus.Rejected: {
      const uncertifiedRejectErrorCode = new UncertifiedRejectErrorCode(
        response.requestId,
        response.reject_code,
        response.reject_message,
        response.error_code,
        response.signatures
      )
      uncertifiedRejectErrorCode.callContext = {
        canisterId,
        effectiveTarget,
        methodName,
        httpDetails: response.httpDetails,
      }
      throw RejectError.fromCode(uncertifiedRejectErrorCode)
    }

    case QueryResponseStatus.Replied:
      return response.reply.arg
  }
}

// ══════════════════════════════════════════════════════════════════════
// UPDATE CALL RESPONSE PROCESSING
// ══════════════════════════════════════════════════════════════════════

type ReadStateArgs = Parameters<Agent["readState"]>

/**
 * Wrap `agent` so that every read_state `pollForResponse` sends is signed by
 * `identity` — the one that submitted the call — rather than by whatever the
 * shared agent holds by the time each poll goes out.
 *
 * `HttpAgent.readState` takes an identity parameter and ignores it: the
 * declaration names it `_identity`, and the body signs a fresh request with
 * the agent's own identity on every call. The one input it sends verbatim is a
 * pre-signed `request`, so that is where the pin has to live. The request is
 * built through `createReadStateRequest`, which does honour an explicit
 * identity, and is rebuilt on every poll so each carries a fresh ingress
 * expiry, exactly as the unpinned path does.
 *
 * `createReadStateRequest` is overridden too, for two reasons. With
 * `preSignReadStateRequest: true`, `pollForResponse` calls it on the agent it
 * was handed and passes no identity, so it has to default to the pinned one.
 * And a prototype delegate must never let an `HttpAgent` method run with the
 * delegate as `this`: those methods touch private fields, which throw on any
 * object that is not the instance itself. Both overrides call the real agent.
 *
 * Everything else — transforms, root key, subnet-key cache, time sync — is
 * still the underlying agent's, reached through the prototype chain.
 *
 * As of @icp-sdk/core 6.1.0 the `preSignReadStateRequest` path never gets as
 * far as the read: `pollForResponse` validates the built request by looking
 * for `toHash` as an own property of the expiry, which `Expiry` defines on its
 * prototype, so every `HttpAgent` request is rejected as invalid. That is
 * upstream and independent of this wrapper; the default path is the one that
 * runs.
 */
export function pinPollingIdentity(agent: Agent, identity: Identity): Agent {
  const createReadStateRequest = agent.createReadStateRequest?.bind(agent)

  const sign = (
    fields: Parameters<NonNullable<Agent["createReadStateRequest"]>>[0],
    requested?: Identity
  ) => createReadStateRequest?.(fields, requested ?? identity)

  return Object.create(agent, {
    createReadStateRequest: { value: sign },
    readState: {
      value: async (
        target: ReadStateArgs[0],
        fields: ReadStateArgs[1],
        requested?: ReadStateArgs[2],
        request?: ReadStateArgs[3]
      ) => {
        // `readState` encodes the paths itself before signing, so a request
        // built ahead of it has to carry them already encoded.
        const signed =
          request ??
          (await sign(
            { ...fields, paths: fields.paths.map(encodePath) },
            requested
          ))
        return agent.readState(target, fields, requested ?? identity, signed)
      },
    },
  })
}

/**
 * Process an update call response following the exact logic from @icp-sdk/core/agent Actor.
 *
 * This handles:
 * - V4 responses with embedded certificate (sync call response)
 * - V2 responses with immediate rejection
 * - 202 responses that require polling
 *
 * @param result - The submit response from agent.call()
 * @param canisterId - The target canister ID
 * @param methodName - The method name being called
 * @param agent - The HTTP agent
 * @param pollingOptions - Options for polling
 * @param effectiveTarget - Canister or subnet used to route and verify the call
 * @returns The raw reply bytes
 * @throws RejectError if the call was rejected
 * @throws UnknownError if the response format is unexpected
 */
export async function processUpdateCallResponse(
  result: SubmitResponse,
  canisterId: Principal,
  methodName: string,
  agent: Agent,
  pollingOptions: PollingOptions,
  effectiveTarget: TargetPrincipal,
  identity?: Identity
): Promise<Uint8Array> {
  let reply: Uint8Array | undefined
  let certificate: Certificate | undefined

  if (isV4ResponseBody(result.response.body)) {
    if (agent.rootKey == null) {
      throw ExternalError.fromCode(new MissingRootKeyErrorCode())
    }
    const cert = result.response.body.certificate
    certificate = await Certificate.create({
      certificate: cert,
      rootKey: agent.rootKey,
      principal: effectiveTarget,
      agent,
    })

    const path = [new TextEncoder().encode("request_status"), result.requestId]
    const status = new TextDecoder().decode(
      lookupResultToBuffer(certificate.lookup_path([...path, "status"]))
    )

    switch (status) {
      case "replied":
        reply = lookupResultToBuffer(
          certificate.lookup_path([...path, "reply"])
        )
        break
      case "rejected": {
        // Find rejection details in the certificate
        const rejectCode = new Uint8Array(
          lookupResultToBuffer(
            certificate.lookup_path([...path, "reject_code"])
          )!
        )[0]
        const rejectMessage = new TextDecoder().decode(
          lookupResultToBuffer(
            certificate.lookup_path([...path, "reject_message"])
          )!
        )

        const error_code_buf = lookupResultToBuffer(
          certificate.lookup_path([...path, "error_code"])
        )
        const error_code = error_code_buf
          ? new TextDecoder().decode(error_code_buf)
          : undefined

        const certifiedRejectErrorCode = new CertifiedRejectErrorCode(
          result.requestId,
          rejectCode,
          rejectMessage,
          error_code
        )
        certifiedRejectErrorCode.callContext = {
          canisterId,
          effectiveTarget,
          methodName,
          httpDetails: result.response,
        }
        throw RejectError.fromCode(certifiedRejectErrorCode)
      }
    }
  } else if (isV2ResponseBody(result.response.body)) {
    const { reject_code, reject_message, error_code } = result.response.body
    const errorCode = new UncertifiedRejectUpdateErrorCode(
      result.requestId,
      reject_code,
      reject_message,
      error_code
    )
    errorCode.callContext = {
      canisterId,
      effectiveTarget,
      methodName,
      httpDetails: result.response,
    }
    throw RejectError.fromCode(errorCode)
  }

  // Fall back to polling if we receive an Accepted response code
  if (result.response.status === 202) {
    // `pollForResponse` signs its read_state through the agent it is handed,
    // which reads whatever identity the shared agent holds at that moment. Pin
    // it to the one that submitted, or a sign-in/sign-out mid-poll makes the
    // replica reject the read for a call that has already committed.
    const pollingAgent = identity ? pinPollingIdentity(agent, identity) : agent

    const response = await pollForResponse(
      pollingAgent,
      effectiveTarget,
      result.requestId,
      pollingOptions
    )
    certificate = response.certificate
    reply = response.reply
  }

  if (reply !== undefined) {
    return reply
  }

  // Unexpected response format
  const httpDetails = {
    ...result.response,
    requestDetails: result.requestDetails,
  } as HttpDetailsResponse
  const errorCode = new UnexpectedErrorCode(
    `Call was returned undefined. We cannot determine if the call was successful or not.`
  )
  errorCode.callContext = {
    canisterId,
    effectiveTarget,
    methodName,
    httpDetails,
  }
  throw UnknownError.fromCode(errorCode)
}
