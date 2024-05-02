import { createAgentManager, createCandidAdapter } from "@ic-reactor/core"
import * as fetcher from "whatwg-fetch"
import * as parser from "../dist/nodejs"
import fs from "fs"
import path from "path"
import { importCandidDefinition } from "@ic-reactor/core/dist/utils"

// Mocking the fetch function
// @ts-ignore
global.fetch = jest.fn((url) => {
  if (url.toString().endsWith("index_bg.wasm")) {
    const wasmContent = fs.readFileSync(
      path.resolve(__dirname, "../dist/index_bg.wasm")
    )
    return wasmContent
  }

  return fetcher.fetch(url)
})

const EXPECTED_JS = `export const idlFactory = ({ IDL }) => {
  return IDL.Service({ 'icrc1_name' : IDL.Func([], [IDL.Text], ['query']) });
};
export const init = ({ IDL }) => { return []; };`

describe("convert candid to js", () => {
  it("compile the candid string", async () => {
    const candid = parser.didToJs(`service:{icrc1_name:()->(text) query;}`)

    expect(candid).toEqual(EXPECTED_JS)
  })
})

const EXPECTED_TS = `import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface _SERVICE { 'icrc1_name' : ActorMethod<[], string> }
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`

describe("convert candid to ts", () => {
  it("compile the candid string", async () => {
    const candid = parser.didToTs(`service:{icrc1_name:()->(text) query;}`)

    expect(candid).toEqual(EXPECTED_TS)
  })
})

describe("createReactorStore", () => {
  const agentManager = createAgentManager()

  const candidAdapter = createCandidAdapter({ agentManager })

  it("compile the candid string", async () => {
    await candidAdapter.initializeParser(parser)
    const candid = candidAdapter.parseDidToJs(
      `service:{icrc1_name:()->(text) query;}`
    )

    expect(candid).toEqual(EXPECTED_JS)

    const candidDef = await importCandidDefinition(candid)
    console.log("🚀 ~ it ~ candidDef:", candidDef)

    expect(candidDef.idlFactory).toBeInstanceOf(Function)
    expect(candidDef.init).toBeInstanceOf(Function)
  })
})
