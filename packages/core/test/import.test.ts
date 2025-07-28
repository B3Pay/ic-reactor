import { describe, it, expect } from "bun:test"
import { importCandidDefinition } from "../src/utils"

const testCandidDef = `
export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    icrc1_name: IDL.Func([], [IDL.Text], ['query']),
  });
};
export const init = ({ IDL }) => { return []; };
`

describe("Debug importCandidDefinition", () => {
  it("should import Candid definition correctly", async () => {
    const candidDef = await importCandidDefinition(testCandidDef)

    expect(candidDef).toBeDefined()
    expect(typeof candidDef.idlFactory).toBe("function")
    expect(typeof candidDef.init).toBe("function")
  })
})
