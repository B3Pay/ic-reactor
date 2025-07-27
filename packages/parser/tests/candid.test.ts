import { describe, it, expect } from "bun:test"
import { createAgentManager, createCandidAdapter } from "@ic-reactor/core"
import * as parser from "../dist/nodejs"
import { importCandidDefinition } from "@ic-reactor/core/src/utils"

const EXPECTED_JS = `export const idlFactory = ({ IDL }) => {
  return IDL.Service({ 'icrc1_name' : IDL.Func([], [IDL.Text], ['query']) });
};
export const init = ({ IDL }) => { return []; };`

const EXPECTED_TS = `import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface _SERVICE { 'icrc1_name' : ActorMethod<[], string> }
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`

// Group all tests to scope the fetch mock
describe("Candid Parser", () => {
  describe("convert candid to js", () => {
    it("should compile the candid string", () => {
      const candid = parser.didToJs("service:{icrc1_name:()->(text) query;}")
      expect(candid).toEqual(EXPECTED_JS)
    })
  })

  describe("convert candid to ts", () => {
    it("should compile the candid string", () => {
      const candid = parser.didToTs("service:{icrc1_name:()->(text) query;}")
      expect(candid).toEqual(EXPECTED_TS)
    })
  })

  describe("createReactorStore", () => {
    it("should initialize parser and create candid definition", async () => {
      const agentManager = createAgentManager()
      const candidAdapter = createCandidAdapter({ agentManager })

      // This will trigger the mocked fetch for the WASM file
      await candidAdapter.initializeParser()

      const candid = candidAdapter.parseDidToJs(
        "service:{icrc1_name:()->(text) query;}"
      )
      expect(candid).toEqual(EXPECTED_JS)

      const candidDef = await importCandidDefinition(candid)

      expect(candidDef.idlFactory).toBeInstanceOf(Function)
      expect(candidDef.init).toBeInstanceOf(Function)
    })
  })
})
