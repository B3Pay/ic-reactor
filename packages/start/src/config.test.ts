import { describe, it, expect } from "vitest"
import {
  defineIcReactorStartConfig,
  normalizeCanisters,
  resolveStartConfig,
  isValidCanisterName,
  DEFAULT_OUT_DIR,
  DEFAULT_CLIENT_MANAGER_PATH,
  type IcReactorStartOptions,
} from "./config"

describe("isValidCanisterName", () => {
  it("accepts valid identifiers", () => {
    expect(isValidCanisterName("backend")).toBe(true)
    expect(isValidCanisterName("my_canister")).toBe(true)
    expect(isValidCanisterName("canister1")).toBe(true)
    expect(isValidCanisterName("$special")).toBe(true)
  })

  it("rejects invalid identifiers", () => {
    expect(isValidCanisterName("")).toBe(false)
    expect(isValidCanisterName("1leading")).toBe(false)
    expect(isValidCanisterName("has-dash")).toBe(false)
    expect(isValidCanisterName("has space")).toBe(false)
    expect(isValidCanisterName(undefined)).toBe(false)
    expect(isValidCanisterName(123 as unknown as string)).toBe(false)
  })
})

describe("normalizeCanisters", () => {
  it("normalizes an object map into CanisterConfig[], taking name from the key", () => {
    const result = normalizeCanisters({
      backend: { didFile: "../backend/backend.did" },
      ledger: { didFile: "../ledger/ledger.did" },
    })

    expect(result).toEqual([
      { name: "backend", didFile: "../backend/backend.did" },
      { name: "ledger", didFile: "../ledger/ledger.did" },
    ])
  })

  it("preserves optional per-canister overrides", () => {
    const result = normalizeCanisters({
      backend: {
        didFile: "../backend/backend.did",
        outDir: "src/gen",
        clientManagerPath: "../../cm",
        target: "core",
      },
    })

    expect(result[0]).toMatchObject({
      name: "backend",
      didFile: "../backend/backend.did",
      outDir: "src/gen",
      clientManagerPath: "../../cm",
      target: "core",
    })
  })

  it("passes an already-normalized array through, validating each entry", () => {
    const input = [{ name: "backend", didFile: "../backend/backend.did" }]
    expect(normalizeCanisters(input)).toEqual(input)
  })

  it("returns [] for an empty object map", () => {
    expect(normalizeCanisters({})).toEqual([])
  })

  it("throws on an invalid canister name in object form", () => {
    expect(() =>
      normalizeCanisters({ "bad-name": { didFile: "x.did" } })
    ).toThrow(/invalid canister name/)
  })

  it("throws on a missing didFile in object form", () => {
    expect(() =>
      // @ts-expect-error -- exercising runtime guard
      normalizeCanisters({ backend: { didFile: "" } })
    ).toThrow(/missing a didFile/)
  })

  it("throws on an invalid name in array form", () => {
    expect(() =>
      normalizeCanisters([{ name: "1bad", didFile: "x.did" }])
    ).toThrow(/invalid canister name/)
  })

  it("throws on non-object / non-array input", () => {
    expect(() =>
      normalizeCanisters(
        "nope" as unknown as Parameters<typeof normalizeCanisters>[0]
      )
    ).toThrow(/object map or an array/)
  })
})

describe("resolveStartConfig", () => {
  it("applies defaults", () => {
    const resolved = resolveStartConfig({
      canisters: { backend: { didFile: "../backend/backend.did" } },
    })

    expect(resolved.outDir).toBe(DEFAULT_OUT_DIR)
    expect(resolved.clientManagerPath).toBe(DEFAULT_CLIENT_MANAGER_PATH)
    expect(resolved.target).toBe("react")
    expect(resolved.injectEnvironment).toBe(true)
    expect(resolved.router).toEqual({ autoCodeSplitting: true })
    expect(resolved.proxyApi).toBe(true)
    expect(resolved.canisters).toHaveLength(1)
  })

  it("respects router: false", () => {
    const resolved = resolveStartConfig({
      canisters: {},
      router: false,
    })
    expect(resolved.router).toBe(false)
  })

  it("respects router options", () => {
    const resolved = resolveStartConfig({
      canisters: {},
      router: { autoCodeSplitting: false },
    })
    expect(resolved.router).toEqual({ autoCodeSplitting: false })
  })
})

describe("defineIcReactorStartConfig", () => {
  it("returns a fully resolved config and infers types", () => {
    const options: IcReactorStartOptions = {
      canisters: { backend: { didFile: "../backend/backend.did" } },
    }
    const config = defineIcReactorStartConfig(options)

    expect(config.canisters[0].name).toBe("backend")
    expect(config.canisters[0].didFile).toBe("../backend/backend.did")
  })

  it("never bakes a canister ID (V0 resolves IDs at runtime)", () => {
    const config = defineIcReactorStartConfig({
      canisters: { backend: { didFile: "../backend/backend.did" } },
    })
    expect(config.canisters[0].canisterId).toBeUndefined()
  })
})
