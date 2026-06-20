import { describe, expect, it } from "vitest"
import {
  defineIcReactorStartConfig,
  normalizeIcReactorStartConfig,
} from "./config.js"

describe("defineIcReactorStartConfig", () => {
  it("returns the config unchanged", () => {
    const config = {
      canisters: {
        backend: {
          didFile: "../backend/backend.did",
        },
      },
    }

    expect(defineIcReactorStartConfig(config)).toBe(config)
  })
})

describe("normalizeIcReactorStartConfig", () => {
  it("normalizes object canister config for @ic-reactor/vite-plugin", () => {
    expect(
      normalizeIcReactorStartConfig({
        canisters: {
          backend: {
            didFile: "../backend/backend.did",
          },
        },
      })
    ).toEqual({
      canisters: [
        {
          name: "backend",
          didFile: "../backend/backend.did",
        },
      ],
      outDir: "src/canisters",
      clientManagerPath: "../../lib/client",
      target: "react",
      injectEnvironment: true,
    })
  })

  it("preserves array canister config and explicit defaults", () => {
    expect(
      normalizeIcReactorStartConfig({
        canisters: [
          {
            name: "backend",
            didFile: "../backend/backend.did",
            outDir: "src/generated/backend",
          },
        ],
        outDir: "src/generated",
        clientManagerPath: "../client",
        target: "core",
        injectEnvironment: false,
      })
    ).toEqual({
      canisters: [
        {
          name: "backend",
          didFile: "../backend/backend.did",
          outDir: "src/generated/backend",
        },
      ],
      outDir: "src/generated",
      clientManagerPath: "../client",
      target: "core",
      injectEnvironment: false,
    })
  })
})
