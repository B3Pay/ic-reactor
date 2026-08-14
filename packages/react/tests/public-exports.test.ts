import { describe, it, expect } from "vitest"
import * as reactPkg from "../src/index.js"

// Smoke test for the public export surface. Every name below is a runtime
// export of @ic-reactor/react (many re-exported from @ic-reactor/core through
// the barrel). `export *` chains fail silently — a renamed or dropped source
// export simply vanishes from the barrel with no type error in this package,
// so this is the CI tripwire for broken re-exports.

const reactHooks = [
  "useReactorQuery",
  "useReactorMutation",
  "useReactorSuspenseQuery",
  "useReactorInfiniteQuery",
  "useReactorSuspenseInfiniteQuery",
  "useActorMethod",
  "useReactorMethod",
] as const

const reactFactories = [
  "createActorHooks",
  "createActorMethodHooks",
  "defineReactor",
  "createQuery",
  "createQueryFactory",
  "createSuspenseQuery",
  "createSuspenseQueryFactory",
  "createInfiniteQuery",
  "createInfiniteQueryFactory",
  "createSuspenseInfiniteQuery",
  "createSuspenseInfiniteQueryFactory",
  "createMutation",
] as const

const authExports = [
  "createAuthHooks",
  "createIdentityAttributeHooks",
  "identityAttributeKeys",
  "normalizeOpenIdProvider",
  "resolveIdentityAttributeKeys",
  "decodeIdentityAttributeValues",
  "normalizeSignedIdentityAttributes",
  "localInternetIdentityProvider",
] as const

const validationExports = [
  "mapValidationErrors",
  "getFieldError",
  "getFieldErrors",
  "extractValidationErrors",
  "handleValidationError",
  "isValidationError",
] as const

const coreClasses = [
  "Reactor",
  "DisplayReactor",
  "ClientManager",
  "AuthenticationManager",
  "IdentityAttributesManager",
  "CanisterError",
  "CallError",
  "ValidationError",
  "DisplayCodecVisitor",
] as const

const coreFunctions = [
  "isCanisterError",
  "isCallError",
  "isRetryableReactorError",
  "reactorRetry",
  "extractOkResult",
  "toReactorQueryData",
  "didToDisplayCodec",
  "didToDisplayCodecs",
  "transformArgsWithCodec",
  "transformResultWithCodec",
  "uint8ArrayToHex",
  "hexToUint8Array",
  "formatHexDisplay",
  "createVariant",
  "getVariantKey",
  "getVariantValue",
] as const

const stringConstants = [
  "VERSION",
  "IC_INTERNET_IDENTITY_PROVIDER",
  "INTERNET_IDENTITY_PROVIDER_ENV_KEY",
  "LOCAL_INTERNET_IDENTITY_CANISTER_ID",
  "LOCAL_INTERNET_IDENTITY_PROVIDER",
  "IDENTITY_ATTRIBUTES_PROVIDER",
  "IDENTITY_ATTRIBUTES_BETA_PROVIDER",
  "IC_HOST_NETWORK_URI",
  "LOCAL_HOST_NETWORK_URI",
] as const

const exportsOf = reactPkg as Record<string, unknown>

describe("public export surface", () => {
  it.each([...reactHooks])("exports hook %s", (name) => {
    expect(exportsOf[name], `"${name}" missing from the barrel`).toBeTypeOf(
      "function"
    )
  })

  it.each([...reactFactories])("exports factory %s", (name) => {
    expect(exportsOf[name], `"${name}" missing from the barrel`).toBeTypeOf(
      "function"
    )
  })

  it.each([...authExports])("exports auth helper %s", (name) => {
    expect(exportsOf[name], `"${name}" missing from the barrel`).toBeTypeOf(
      "function"
    )
  })

  it.each([...validationExports])("exports validation helper %s", (name) => {
    expect(exportsOf[name], `"${name}" missing from the barrel`).toBeTypeOf(
      "function"
    )
  })

  it.each([...coreClasses])("re-exports core class %s", (name) => {
    expect(exportsOf[name], `"${name}" missing from the barrel`).toBeTypeOf(
      "function"
    )
  })

  it.each([...coreFunctions])("re-exports core function %s", (name) => {
    expect(exportsOf[name], `"${name}" missing from the barrel`).toBeTypeOf(
      "function"
    )
  })

  it.each([...stringConstants])("exports constant %s", (name) => {
    expect(exportsOf[name], `"${name}" missing from the barrel`).toBeTypeOf(
      "string"
    )
  })

  it("aliases point at the same implementation", () => {
    expect(reactPkg.useReactorMethod).toBe(reactPkg.useActorMethod)
  })

  it("VERSION carries a semver string", () => {
    expect(reactPkg.VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
