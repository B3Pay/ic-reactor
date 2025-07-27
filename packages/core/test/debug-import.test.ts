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
    console.log("Input candidDef:", testCandidDef)

    const candidDef = await importCandidDefinition(testCandidDef)
    console.log("Result candidDef:", candidDef)
    console.log("candidDef.idlFactory:", candidDef.idlFactory)
    console.log("candidDef.idlFactory type:", typeof candidDef.idlFactory)
    console.log("candidDef.init:", candidDef.init)
    console.log("candidDef.init type:", typeof candidDef.init)

    expect(candidDef).toBeDefined()
    expect(typeof candidDef.idlFactory).toBe("function")
    expect(typeof candidDef.init).toBe("function")
  })
})
