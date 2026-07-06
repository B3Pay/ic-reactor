import type { CandidFieldIR, ProgramIR } from "./types.js"

export const PROGRAM_IR_VERSION = 1

export class UnsupportedProgramIRVersionError extends Error {
  constructor(
    readonly actual: number,
    readonly expected = PROGRAM_IR_VERSION
  ) {
    super(`Unsupported ProgramIR version ${actual}; expected ${expected}`)
    this.name = "UnsupportedProgramIRVersionError"
  }
}

export function assertProgramIRVersion(ir: ProgramIR): void {
  if (ir.version !== PROGRAM_IR_VERSION) {
    throw new UnsupportedProgramIRVersionError(ir.version)
  }
}

export function fieldObjectKey(field: CandidFieldIR): string {
  switch (field.label.kind) {
    case "named":
      return field.label.name
    case "id":
    case "unnamed":
      return `_${field.label.id}_`
  }
}
