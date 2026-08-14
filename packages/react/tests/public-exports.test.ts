import { describe, it, expect } from "vitest"
import * as reactPkg from "../src/index.js"

// Smoke test for the public export surface. `export *` chains fail silently —
// a renamed or dropped source export simply vanishes from the barrel with no
// type error in this package — so this snapshot is the CI tripwire for broken
// re-exports. It pins the COMPLETE runtime surface (every value export and
// its typeof), not a sample: a partial list would stay green while an
// unlisted export disappeared. Adding a new export means adding it here.

const RUNTIME_EXPORTS: Record<string, "function" | "string" | "object"> = {
  // React hooks (raw implementations, public under useReactor* aliases)
  useReactorQuery: "function",
  useReactorMutation: "function",
  useReactorSuspenseQuery: "function",
  useReactorInfiniteQuery: "function",
  useReactorSuspenseInfiniteQuery: "function",
  useActorMethod: "function",
  useReactorMethod: "function",

  // React factories and setup
  createActorHooks: "function",
  createActorMethodHooks: "function",
  defineReactor: "function",
  createQuery: "function",
  createQueryFactory: "function",
  createSuspenseQuery: "function",
  createSuspenseQueryFactory: "function",
  createInfiniteQuery: "function",
  createInfiniteQueryFactory: "function",
  createSuspenseInfiniteQuery: "function",
  createSuspenseInfiniteQueryFactory: "function",
  createMutation: "function",

  // Auth
  AuthenticationManager: "function",
  IdentityAttributesManager: "function",
  createAuthHooks: "function",
  createIdentityAttributeHooks: "function",
  identityAttributeKeys: "function",
  normalizeOpenIdProvider: "function",
  resolveIdentityAttributeKeys: "function",
  decodeIdentityAttributeValues: "function",
  normalizeSignedIdentityAttributes: "function",
  localInternetIdentityProvider: "function",
  IC_INTERNET_IDENTITY_PROVIDER: "string",
  INTERNET_IDENTITY_PROVIDER_ENV_KEY: "string",
  LOCAL_INTERNET_IDENTITY_CANISTER_ID: "string",
  LOCAL_INTERNET_IDENTITY_PROVIDER: "string",
  IDENTITY_ATTRIBUTES_PROVIDER: "string",
  IDENTITY_ATTRIBUTES_BETA_PROVIDER: "string",

  // Validation helpers
  mapValidationErrors: "function",
  getFieldError: "function",
  getFieldErrors: "function",
  extractValidationErrors: "function",
  handleValidationError: "function",

  // Core classes
  Reactor: "function",
  DisplayReactor: "function",
  ClientManager: "function",
  CanisterError: "function",
  CallError: "function",
  ValidationError: "function",
  DisplayCodecVisitor: "function",

  // Core error taxonomy and retry
  isCanisterError: "function",
  isCallError: "function",
  isValidationError: "function",
  isRetryableReactorError: "function",
  reactorRetry: "function",

  // Core call/result helpers
  extractOkResult: "function",
  toReactorQueryData: "function",
  processQueryCallResponse: "function",
  processUpdateCallResponse: "function",
  createPollingStrategy: "function",
  generateKey: "function",
  toHashableKeySegment: "function",

  // Core display codecs
  didToDisplayCodec: "function",
  didToDisplayCodecs: "function",
  didTypeFromArray: "function",
  transformArgsWithCodec: "function",
  transformResultWithCodec: "function",
  fromZodSchema: "function",

  // Core value utilities
  uint8ArrayToHex: "function",
  hexToUint8Array: "function",
  formatHexDisplay: "function",
  createVariant: "function",
  createNullVariant: "function",
  getVariantKey: "function",
  getVariantValue: "function",
  getVariantKeyValue: "function",
  getVariantValueByKey: "function",
  isKeyMatchVariant: "function",
  isNullish: "function",
  nonNullish: "function",
  jsonToString: "function",

  // Core environment helpers
  isDev: "function",
  isInLocalOrDevelopment: "function",
  isMainnetHost: "function",
  getNetworkByHostname: "function",
  getProcessEnvNetwork: "function",
  IC_HOST_NETWORK_URI: "string",
  LOCAL_HOST_NETWORK_URI: "string",
  LOCAL_HOSTS: "object",
  REMOTE_HOSTS: "object",

  // Version
  VERSION: "string",
}

const exportsOf = reactPkg as Record<string, unknown>

describe("public export surface", () => {
  it.each(Object.keys(RUNTIME_EXPORTS))("exports %s", (name) => {
    expect(exportsOf[name], `"${name}" missing from the barrel`).toBeTypeOf(
      RUNTIME_EXPORTS[name]
    )
  })

  it("the snapshot covers every runtime export the barrel actually ships", () => {
    // The inverse direction: an export added to the barrel but not recorded
    // here would otherwise erode the snapshot's "complete surface" claim.
    const actual = Object.keys(exportsOf)
      .filter((name) => exportsOf[name] !== undefined)
      .sort()
    const recorded = Object.keys(RUNTIME_EXPORTS).sort()
    expect(actual).toEqual(recorded)
  })

  it("aliases point at the same implementation", () => {
    expect(reactPkg.useReactorMethod).toBe(reactPkg.useActorMethod)
  })

  it("VERSION carries a semver string", () => {
    expect(reactPkg.VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
