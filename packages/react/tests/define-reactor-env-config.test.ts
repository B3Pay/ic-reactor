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

// A recognisable DER-shaped key, so a root key taken from the cookie is
// distinguishable from the mainnet key the agent pins by default.
const ENV_ROOT_KEY = new Uint8Array(133).fill(7)

vi.mock("@icp-sdk/core/agent/canister-env", () => ({
  safeGetCanisterEnv: () => ({ IC_ROOT_KEY: ENV_ROOT_KEY }),
}))

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

  it("forwards the deprecated spelling, scoped to the root key", () => {
    // Two halves, and the first alone would be vacuous: `trustsEnvConfig` is
    // false both when the option is correctly forwarded-but-narrow and when it
    // is dropped on the floor. The root key is the only thing that flag grants,
    // so it is the only place forwarding is observable.
    const { clientManager } = defineReactor({
      name: "backend",
      idlFactory,
      canisterId: CANISTER_ID,
      agentOptions: { host: "https://testnet.example.com" },
      allowEnvRootKey: true,
    })
    expect(clientManager.trustsEnvConfig).toBe(false)

    const rootKey = clientManager.agent.rootKey
    const bytes =
      rootKey instanceof Uint8Array
        ? rootKey
        : new Uint8Array((rootKey ?? new ArrayBuffer(0)) as ArrayBuffer)
    expect(bytes.length).toBe(ENV_ROOT_KEY.length)
    expect(bytes.every((b) => b === 7)).toBe(true)
  })

  it("refuses the option when a supplied ClientManager would ignore it", () => {
    // Silently dropping `allowEnvConfig: false` is the worst shape of this: the
    // caller reads it as having locked the cookie out.
    const { clientManager } = defineReactor({
      name: "backend",
      idlFactory,
      canisterId: CANISTER_ID,
      agentOptions: { host: "http://127.0.0.1:4943" },
    })
    expect(() =>
      defineReactor({
        name: "other",
        idlFactory,
        canisterId: CANISTER_ID,
        clientManager,
        allowEnvConfig: false,
      })
    ).toThrow(/already carries its own/)
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
