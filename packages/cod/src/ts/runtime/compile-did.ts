import { CandidProgram, initCod } from "../index.js"
import { RuntimeProgramImpl } from "./program.js"
import type { CompileDidOptions, RuntimeProgram } from "./types.js"

export async function compileDid(
  source: string,
  options: CompileDidOptions = {}
): Promise<RuntimeProgram> {
  if (options.parser && options.parser !== "wasm") {
    throw new Error(
      `unsupported Candid parser ${JSON.stringify(options.parser)}`
    )
  }
  if (options.imports && options.imports !== "reject") {
    throw new Error(
      `unsupported Candid import mode ${JSON.stringify(options.imports)}`
    )
  }
  rejectImports(source)

  await initCod()
  const program = new CandidProgram(source)
  return new RuntimeProgramImpl({
    source,
    ir: program.ir(),
    program,
    formOptions: options,
  })
}

function rejectImports(source: string): void {
  if (/^\s*import(?:\s+service)?\s+"/m.test(source)) {
    throw new Error("Candid imports are not supported by compileDid yet")
  }
}
