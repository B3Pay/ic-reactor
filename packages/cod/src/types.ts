/**
 * Candid Codec — Type Definitions
 *
 * Metadata model and type-level inference utilities for the codec layer.
 */

import type { Principal } from "@icp-sdk/core/principal"

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Optional metadata carried by every codec node.
 * Populated from Candid doc-comments and `.describe()` / `.meta()` chains.
 */
export type CandidMetadata = {
  /** Candid type name, e.g. "Account" */
  name?: string
  /** Human-readable description (from `///` comments or `.describe()`) */
  description?: string
  /** Raw doc comment lines */
  docs?: string[]
  /** Display label for form rendering */
  label?: string
  /** Example values for docs / AI context */
  examples?: unknown[]
  /** Source location in the `.did` file */
  source?: {
    file?: string
    line?: number
    column?: number
  }
  /** Hints for form/UI rendering */
  form?: {
    widget?: string
    placeholder?: string
    min?: string | number
    max?: string | number
    options?: unknown[]
  }
  /** Validation metadata for generated forms and validation helpers */
  validation?: CandidValidationMetadata
  /** Arbitrary extension point */
  custom?: Record<string, unknown>
}

export type CandidValidationMetadata = {
  minimum?: CandidValidationBound
  maximum?: CandidValidationBound
  minLength?: CandidValidationBound
  maxLength?: CandidValidationBound
  pattern?: string
  format?: CandidValidationFormat
}

export type CandidValidationBound = {
  value: string
  message?: string
}

export type CandidValidationFormat = {
  type: string
  message?: string
  regex?: string
  jsonSchemaFormat?: string
  contentEncoding?: string
  errorMessage?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Manifest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured manifest describing a single service method.
 */
export type CandidMethodManifest = {
  name: string
  mode: "query" | "update" | "oneway"
  args: CandidFieldManifest[]
  returns: CandidFieldManifest[]
  docs?: string[]
}

/**
 * Structured manifest describing a single field/argument.
 */
export type CandidFieldManifest = {
  name?: string
  kind: string
  metadata: CandidMetadata
}

/**
 * Full service manifest returned by `service.manifest()`.
 */
export type CandidServiceManifest = {
  methods: CandidMethodManifest[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Inference — internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps codec kind strings to their TypeScript runtime types.
 * Used internally by the conditional inference types.
 */
export interface CandidPrimitiveMap {
  text: string
  bool: boolean
  nat: bigint
  int: bigint
  nat8: number
  nat16: number
  nat32: number
  nat64: bigint
  int8: number
  int16: number
  int32: number
  int64: bigint
  float32: number
  float64: number
  principal: Principal
  null: null
  reserved: any // eslint-disable-line @typescript-eslint/no-explicit-any
  empty: never
  blob: Uint8Array | number[]
}
