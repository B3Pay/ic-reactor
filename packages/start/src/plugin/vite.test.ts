import { describe, expect, it, vi } from "vitest"
import { icReactor } from "@ic-reactor/vite-plugin"
import tanstackRouter from "@tanstack/router-plugin/vite"
import { icReactorStart } from "./vite.js"

vi.mock("@ic-reactor/vite-plugin", () => ({
  icReactor: vi.fn((options) => ({
    name: "ic-reactor-plugin",
    options,
  })),
}))

vi.mock("@tanstack/router-plugin/vite", () => ({
  default: vi.fn((options) => ({
    name: "tanstack-router-plugin",
    options,
  })),
}))

describe("icReactorStart", () => {
  it("composes TanStack Router and IC Reactor Vite plugins", () => {
    const plugins = icReactorStart({
      canisters: {
        backend: {
          didFile: "../backend/backend.did",
        },
      },
    }) as any[]

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      "tanstack-router-plugin",
      "ic-reactor-plugin",
    ])
    expect(tanstackRouter).toHaveBeenCalledWith({
      target: "react",
      autoCodeSplitting: true,
    })
    expect(icReactor).toHaveBeenCalledWith({
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

  it("allows TanStack Router option overrides", () => {
    icReactorStart({
      router: {
        target: "react",
        autoCodeSplitting: false,
      },
    })

    expect(tanstackRouter).toHaveBeenLastCalledWith({
      target: "react",
      autoCodeSplitting: false,
    })
  })
})
