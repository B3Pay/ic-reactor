import type {
  ApiQueryResponse,
  HttpAgent,
  HttpDetailsResponse,
  PollingOptions,
  SubmitResponse,
} from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"

import {
  isV2ResponseBody,
  isV4ResponseBody,
  Certificate,
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
 * @param blsVerify - Optional BLS verification function
 * @returns The raw reply bytes
 * @throws RejectError if the call was rejected
 * @throws UnknownError if the response format is unexpected
 */
export async function processUpdateCallResponse(
  result: SubmitResponse,
  canisterId: Principal,
  methodName: string,
  agent: HttpAgent,
  pollingOptions: PollingOptions
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
      principal: { canisterId },
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
      methodName,
      httpDetails: result.response,
    }
    throw RejectError.fromCode(errorCode)
  }

  // Fall back to polling if we receive an Accepted response code
  if (result.response.status === 202) {
    // Contains the certificate and the reply from the boundary node
    const response = await pollForResponse(
      agent,
      canisterId,
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
    methodName,
    httpDetails,
  }
  throw UnknownError.fromCode(errorCode)
}
