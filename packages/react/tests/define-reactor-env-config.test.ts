/**
 * `defineReactor` builds the ClientManager for the one-call setup path, so an
 * option it accepts in its type but drops on the way through is an option that
 * does not exist. `allowEnvConfig` decides whether the `ic_env` cookie is
 * trusted for the root key, the Internet Identity provider and a reactor's
 * canister ID (#348) — dropping it silently leaves callers on the default,
 * which on a real domain refuses the cookie they were trying to opt into.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { defineReactor } from "../src/defineReactor.js"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ get: IDL.Func([], [IDL.Text], ["query"]) })

const CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"

beforeEach(() => {
  vi.stubGlobal("window", {
    location: {
      origin: "https://app.example.com",
      protocol: "https:",
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function trustsEnvConfig(options: Record<string, unknown>) {
  const { clientManager } = defineReactor({
    name: "backend",
    idlFactory,
    canisterId: CANISTER_ID,
    agentOptions: { host: "https://app.example.com" },
    ...options,
  })
  return clientManager.trustsEnvConfig
}

describe("defineReactor forwards the ic_env opt-in", () => {
  it("defaults to refusing the cookie on a real domain", () => {
    expect(trustsEnvConfig({})).toBe(false)
  })

  it("forwards allowEnvConfig to the ClientManager it creates", () => {
    expect(trustsEnvConfig({ allowEnvConfig: true })).toBe(true)
  })

  it("forwards the deprecated allowEnvRootKey spelling too", () => {
    expect(trustsEnvConfig({ allowEnvRootKey: true })).toBe(true)
  })

  it("forwards an explicit opt-out on a local replica", () => {
    const { clientManager } = defineReactor({
      name: "backend",
      idlFactory,
      canisterId: CANISTER_ID,
      agentOptions: { host: "http://127.0.0.1:4943" },
      allowEnvConfig: false,
    })
    expect(clientManager.trustsEnvConfig).toBe(false)
  })
})
