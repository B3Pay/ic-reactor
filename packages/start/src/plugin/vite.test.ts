import { describe, it, expect, vi, beforeEach } from "vitest"

// vi.hoisted ensures these are available when vi.mock factories run (which are
// hoisted to the top of the file by Vitest).
const { icReactorMock, mockRouterPlugin } = vi.hoisted(() => {
  const icReactorMock = vi.fn(() => ({ name: "ic-reactor-plugin" }))

  const mockRouterPlugin = {
    name: "tanstack-router-plugin",
    _opts: {} as Record<string, unknown>,
  }

  return { icReactorMock, mockRouterPlugin }
})

vi.mock("@ic-reactor/vite-plugin", () => ({
  icReactor: icReactorMock,
}))

vi.mock("node:module", () => ({
  createRequire: () => {
    return (id: string) => {
      if (id === "@tanstack/router-plugin/vite") {
        return {
          default: (opts: Record<string, unknown>) => {
            mockRouterPlugin._opts = opts
            return { ...mockRouterPlugin }
          },
        }
      }
      throw new Error(`Cannot find module '${id}'`)
    }
  },
}))

import { icReactorStart } from "./vite"

describe("icReactorStart preset", () => {
  beforeEach(() => {
    icReactorMock.mockClear()
  })

  it("returns a Vite plugin array that includes the ic-reactor plugin", () => {
    const plugins = icReactorStart({
      canisters: { backend: { didFile: "../backend/backend.did" } },
    })

    expect(Array.isArray(plugins)).toBe(true)
    expect(plugins.some((p) => p.name === "ic-reactor-plugin")).toBe(true)
  })

  it("includes the TanStack Router plugin by default", () => {
    const plugins = icReactorStart({
      canisters: { backend: { didFile: "../backend/backend.did" } },
    })
    expect(plugins.some((p) => p.name === "tanstack-router-plugin")).toBe(true)
  })

  it("omits the router plugin when router: false", () => {
    const plugins = icReactorStart({
      canisters: { backend: { didFile: "../backend/backend.did" } },
      router: false,
    })
    expect(plugins.some((p) => p.name === "tanstack-router-plugin")).toBe(false)
    expect(
      plugins.some((p) => p.name === "ic-reactor-start:router-missing")
    ).toBe(false)
  })

  it("passes normalized canister config (object → CanisterConfig[]) to @ic-reactor/vite-plugin", () => {
    icReactorStart({
      canisters: {
        backend: { didFile: "../backend/backend.did" },
        ledger: { didFile: "../ledger/ledger.did" },
      },
    })

    expect(icReactorMock).toHaveBeenCalledTimes(1)
    const passed = icReactorMock.mock.calls[0][0]
    expect(passed.canisters).toEqual([
      { name: "backend", didFile: "../backend/backend.did" },
      { name: "ledger", didFile: "../ledger/ledger.did" },
    ])
  })

  it("forwards default outDir, clientManagerPath, target, and injectEnvironment", () => {
    icReactorStart({
      canisters: { backend: { didFile: "../backend/backend.did" } },
    })

    const passed = icReactorMock.mock.calls[0][0]
    expect(passed.outDir).toBe("src/declarations")
    expect(passed.clientManagerPath).toBe("../../lib/client")
    expect(passed.target).toBe("react")
    expect(passed.injectEnvironment).toBe(true)
  })

  it("does not forward canister IDs (V0 resolves them at runtime)", () => {
    icReactorStart({
      canisters: { backend: { didFile: "../backend/backend.did" } },
    })

    const passed = icReactorMock.mock.calls[0][0]
    expect(passed.canisters[0].canisterId).toBeUndefined()
  })

  it("respects custom outDir and clientManagerPath", () => {
    icReactorStart({
      canisters: { backend: { didFile: "../backend/backend.did" } },
      outDir: "src/gen",
      clientManagerPath: "../../cm",
    })

    const passed = icReactorMock.mock.calls[0][0]
    expect(passed.outDir).toBe("src/gen")
    expect(passed.clientManagerPath).toBe("../../cm")
  })

  it("passes autoCodeSplitting: true by default to the router plugin", () => {
    icReactorStart({
      canisters: { backend: { didFile: "../backend/backend.did" } },
    })

    expect(mockRouterPlugin._opts).toEqual({
      target: "react",
      autoCodeSplitting: true,
    })
  })

  it("passes autoCodeSplitting: false when configured", () => {
    icReactorStart({
      canisters: { backend: { didFile: "../backend/backend.did" } },
      router: { autoCodeSplitting: false },
    })

    expect(mockRouterPlugin._opts).toEqual({
      target: "react",
      autoCodeSplitting: false,
    })
  })
})
