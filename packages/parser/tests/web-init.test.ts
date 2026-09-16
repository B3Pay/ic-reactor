import { readFileSync } from "node:fs"
import init, { didToJs, initSync, validateIDL } from "../dist/web/index.js"
import { afterEach, describe, it, expect, vi } from "vitest"

// The web entry loads the module itself so it can keep the compiled
// WebAssembly.Module for recovery. These tests pin that it still loads the way
// wasm-bindgen's generated init does.

const WASM = readFileSync(new URL("../dist/web/index_bg.wasm", import.meta.url))

describe("web build init", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("throws before init", () => {
    expect(() => didToJs("service : {}")).toThrow(TypeError)
  })

  it("fetches index_bg.wasm next to the entry when called with no argument", async () => {
    const fetchWasm = vi.fn(
      async (_url: URL) =>
        new Response(WASM, { headers: { "Content-Type": "application/wasm" } })
    )
    vi.stubGlobal("fetch", fetchWasm)

    const exports = await init()

    expect(fetchWasm).toHaveBeenCalledTimes(1)
    expect(String(fetchWasm.mock.calls[0][0])).toMatch(
      /\/dist\/web\/index_bg\.wasm$/
    )
    expect(exports.memory).toBeInstanceOf(WebAssembly.Memory)
    expect(validateIDL("service : { greet : (text) -> (text) query }")).toBe(
      true
    )

    // Later calls return the running instance without loading anything.
    expect(await init()).toBe(exports)
    expect(initSync({ module: WASM })).toBe(exports)
    expect(fetchWasm).toHaveBeenCalledTimes(1)
  })

  it("recovers from a trap after an async init", () => {
    // init compiled the module asynchronously. Recovery still needs that module.
    expect(() => didToJs(String.raw`service : "\ff"`)).toThrow(
      /^The Candid parser could not parse this input\./
    )
    expect(validateIDL("service : { greet : (text) -> (text) query }")).toBe(
      true
    )
  })
})
