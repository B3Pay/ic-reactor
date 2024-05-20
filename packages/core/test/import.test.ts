import { importCandidDefinition } from "../src/utils"

const testCandidDef = `
export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    icrc1_name: IDL.Func([], [IDL.Text], ['query']),
  });
};
export const init = ({ IDL }) => { return []; };
`

describe("importCandidDefinition", () => {
  it("should import Candid definition", async () => {
    const candidDef = await importCandidDefinition(testCandidDef)
    expect(candidDef).toBeDefined()
  })
})
