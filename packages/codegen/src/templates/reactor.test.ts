import { describe, it, expect } from "vitest"
import { generateReactorFile } from "./reactor"
import type { ReactorGeneratorOptions } from "../types"

describe("Reactor File Generation", () => {
  const baseOptions: ReactorGeneratorOptions = {
    canisterName: "my_canister",
    canisterConfig: {
      didFile: "path/to/my_canister.did",
      outDir: "src/declarations/my_canister",
      clientManagerPath: "../../client",
    },
  }

  describe("Standard Mode", () => {
    it("generates correctly", () => {
      const result = generateReactorFile(baseOptions)
      expect(result).toMatchSnapshot()
    })

    it("uses default client path if not provided", () => {
      const options = { ...baseOptions, canisterConfig: { didFile: "foo.did" } }
      const result = generateReactorFile(options)
      expect(result).toContain('import { clientManager } from "../../client"')
    })
  })
})
