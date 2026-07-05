/// <reference types="node" />
/**
 * Test helpers for loading the cod WASM module in Node.js
 * and providing assertion utilities.
 *
 * This file is test-only — it is not part of the production build.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { initSync } from "../../pkg/cod_core.js"
import { CandidProgram } from "./index.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let initialized = false

/**
 * Synchronously initialize the WASM module for tests.
 * Safe to call multiple times; only loads once.
 */
export function initWasmForTest(): void {
  if (initialized) return
  const wasmPath = resolve(__dirname, "..", "..", "pkg", "cod_core_bg.wasm")
  const wasmBytes = readFileSync(wasmPath)
  initSync({ module: wasmBytes })
  initialized = true
}

/**
 * Create a CandidProgram from a DID source string.
 * Ensures WASM is initialized first.
 */
export function programForTest(did: string): CandidProgram {
  initWasmForTest()
  return new CandidProgram(did)
}

/**
 * Assert two Uint8Arrays are byte-identical.
 * Throws with a detailed hex diff on mismatch.
 */
export function assertBytesEqual(
  actual: Uint8Array,
  expected: Uint8Array,
  message?: string
): void {
  const prefix = message ? `${message}: ` : ""
  if (actual.length !== expected.length) {
    throw new Error(
      `${prefix}Length mismatch: actual=${actual.length}, expected=${expected.length}\n` +
        `  actual:   ${hexDump(actual)}\n` +
        `  expected: ${hexDump(expected)}`
    )
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        `${prefix}Byte mismatch at offset ${i}: actual=0x${hex(actual[i]!)}, expected=0x${hex(expected[i]!)}\n` +
          `  actual:   ${hexDump(actual)}\n` +
          `  expected: ${hexDump(expected)}`
      )
    }
  }
}

function hex(byte: number): string {
  return byte.toString(16).padStart(2, "0")
}

function hexDump(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => hex(b)).join(" ")
}
