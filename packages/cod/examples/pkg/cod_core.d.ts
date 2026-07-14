/* tslint:disable */
/* eslint-disable */

export class WasmCandidProgram {
  free(): void
  [Symbol.dispose](): void
  decodeInitArgs(bytes: Uint8Array): string
  decodeMethodArgs(method: string, bytes: Uint8Array): string
  decodeMethodReply(method: string, bytes: Uint8Array): string
  encodeInitArgs(args_text: string): Uint8Array
  encodeMethodArgs(method: string, args_text: string): Uint8Array
  irJson(): string
  constructor(source: string)
  serviceDid(): string
  summaryJson(): string
}

export function decodeDynamicArgs(bytes: Uint8Array): string

export function encodeDynamicArgs(args_text: string): Uint8Array

export function generateTypescript(source: string): string

export function generateTypescriptForCanister(
  source: string,
  canister_name: string
): string

export function start(): void

export type InitInput =
  RequestInfo | URL | Response | BufferSource | WebAssembly.Module

export interface InitOutput {
  readonly memory: WebAssembly.Memory
  readonly __wbg_wasmcandidprogram_free: (a: number, b: number) => void
  readonly decodeDynamicArgs: (
    a: number,
    b: number
  ) => [number, number, number, number]
  readonly encodeDynamicArgs: (
    a: number,
    b: number
  ) => [number, number, number, number]
  readonly generateTypescript: (
    a: number,
    b: number
  ) => [number, number, number, number]
  readonly generateTypescriptForCanister: (
    a: number,
    b: number,
    c: number,
    d: number
  ) => [number, number, number, number]
  readonly wasmcandidprogram_decodeInitArgs: (
    a: number,
    b: number,
    c: number
  ) => [number, number, number, number]
  readonly wasmcandidprogram_decodeMethodArgs: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number, number]
  readonly wasmcandidprogram_decodeMethodReply: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number, number]
  readonly wasmcandidprogram_encodeInitArgs: (
    a: number,
    b: number,
    c: number
  ) => [number, number, number, number]
  readonly wasmcandidprogram_encodeMethodArgs: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number, number]
  readonly wasmcandidprogram_irJson: (
    a: number
  ) => [number, number, number, number]
  readonly wasmcandidprogram_new: (
    a: number,
    b: number
  ) => [number, number, number]
  readonly wasmcandidprogram_serviceDid: (
    a: number
  ) => [number, number, number, number]
  readonly wasmcandidprogram_summaryJson: (
    a: number
  ) => [number, number, number, number]
  readonly start: () => void
  readonly __wbindgen_free: (a: number, b: number, c: number) => void
  readonly __wbindgen_malloc: (a: number, b: number) => number
  readonly __wbindgen_realloc: (
    a: number,
    b: number,
    c: number,
    d: number
  ) => number
  readonly __wbindgen_externrefs: WebAssembly.Table
  readonly __externref_table_dealloc: (a: number) => void
  readonly __wbindgen_start: () => void
}

export type SyncInitInput = BufferSource | WebAssembly.Module

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(
  module: { module: SyncInitInput } | SyncInitInput
): InitOutput

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?:
    | { module_or_path: InitInput | Promise<InitInput> }
    | InitInput
    | Promise<InitInput>
): Promise<InitOutput>
