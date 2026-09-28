// `./api` of the identity-attributes demo: the app's own client for the
// backend that issues a registration nonce and verifies the signed attributes.
import type { IdentityAttributeResult } from "@ic-reactor/react"

export declare const api: {
  registerBegin(args: {
    expectedKeys: string[]
  }): Promise<{ nonce: Uint8Array }>
  registerFinish(
    args: Pick<
      IdentityAttributeResult,
      "principal" | "requestedKeys" | "signedAttributes"
    >
  ): Promise<void>
}
