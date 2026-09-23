import { importCandidDefinition } from "@ic-reactor/candid"
import { IDL } from "@icp-sdk/core/candid"
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import * as parser from "../dist/nodejs"

// didToTs output imports `Principal` and `ActorMethod`, and exports each
// Candid type under its own name, so a type named like an import conflicted
// with it (TS2440, hidden by skipLibCheck). The file's references to that name
// meant the import, so a method taking the Candid type was typed as taking the
// SDK's class. A type named like a global the output uses, such as `Array` or
// `Uint8Array`, hid it: `Array<string>` was not generic (TS2315), and a blob
// was typed as the Candid type. didToJs declares each type as a `const` inside
// `({ IDL }) => { … }`, so a type named `IDL` redeclared the parameter: a
// SyntaxError, and neither codegen's module nor CandidReactor could load it.

const CANDID = `
  // Not the Principal that @icp-sdk/core exports.
  type Principal = record { id : principal; "Principal" : text };
  type ActorMethod = func (nat) -> (nat) query;
  type IDL = vec Principal;
  service : (IDL) -> {
    whoami : () -> (principal) query;
    get : (Principal) -> (IDL) query;
    double : ActorMethod;
    notify : (func () -> ()) -> ();
  }
`

const packageDir = fileURLToPath(new URL("..", import.meta.url))
let project = ""

beforeAll(() => {
  project = realpathSync(
    mkdtempSync(join(tmpdir(), "ic-reactor-parser-names-"))
  )
  mkdirSync(join(project, "node_modules", "@icp-sdk"), { recursive: true })
  symlinkSync(
    realpathSync(join(packageDir, "node_modules", "@icp-sdk", "core")),
    join(project, "node_modules", "@icp-sdk", "core"),
    "junction"
  )
})

afterAll(() => {
  rmSync(project, { recursive: true, force: true })
})

/** TypeScript's errors for `files`, written into the project, with lib checks on. */
function typeErrors(files: Record<string, string>): string[] {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(project, name), content)
  }
  const program = ts.createProgram(
    Object.keys(files)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => join(project, name)),
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: [],
    }
  )
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const where = diagnostic.file
      ? diagnostic.file.fileName.slice(project.length + 1)
      : ""
    return `${where}: TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
  })
}

/** didToJs output, loaded the way an ES module loads it (strict mode). */
function loadStrict(js: string) {
  const body = js.replace(/export const (\w+) =/g, "const $1 =")
  const load = new Function(
    "IDL",
    `"use strict";\n${body}\nreturn { idlFactory, init };`
  )
  return load(IDL) as {
    idlFactory: IDL.InterfaceFactory
    init: (args: { IDL: typeof IDL }) => IDL.Type[]
  }
}

function method(service: IDL.ServiceClass, name: string): IDL.FuncClass {
  const func = service._fields.find(([methodName]) => methodName === name)?.[1]
  if (!func) throw new Error(`the service has no method ${name}`)
  return func
}

describe("a Candid type named like one of the binding's own names", () => {
  it("keeps its name in didToTs, which aliases the import instead", () => {
    expect(parser.didToTs(CANDID))
      .toBe(`import type { Principal as __Principal } from '@icp-sdk/core/principal';
import type { ActorMethod as __ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export type ActorMethod = __ActorMethod<[bigint], bigint>;
export type IDL = Array<Principal>;
/**
 * Not the Principal that @icp-sdk/core exports.
 */
export interface Principal { 'id' : __Principal, 'Principal' : string }
export interface _SERVICE {
  'double' : ActorMethod,
  'get' : __ActorMethod<[Principal], IDL>,
  'notify' : __ActorMethod<[[__Principal, string]], undefined>,
  'whoami' : __ActorMethod<[], __Principal>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`)
  })

  it("gives didToTs output that type-checks with skipLibCheck off, principal meaning the SDK's Principal", () => {
    const errors = typeErrors({
      "service.d.ts": parser.didToTs(CANDID),
      "service.js": parser.didToJs(CANDID),
      "consumer.ts": `
        import type { Principal as SdkPrincipal } from "@icp-sdk/core/principal"
        import type { ActorMethod as SdkActorMethod } from "@icp-sdk/core/agent"
        import type { _SERVICE, ActorMethod, IDL, Principal } from "./service.js"

        declare const service: _SERVICE
        declare const principal: SdkPrincipal

        export const me: Promise<SdkPrincipal> = service.whoami()
        export const record: Principal = { id: principal, Principal: "name" }
        export const list: Promise<IDL> = service.get(record)
        export const records: Principal[] = [] as IDL
        export const double: SdkActorMethod<[bigint], bigint> = service.double
        export const alias: ActorMethod = double
        export const notify: Promise<undefined> = service.notify([principal, "method"])
      `,
    })

    expect(errors).toEqual([])
    // A full TypeScript program is checked here; on a busy CI runner that can
    // take longer than vitest's 5 s default.
  }, 30_000)

  it("loads as didToJs output, with the IDL types the Candid declares", async () => {
    const js = parser.didToJs(CANDID)
    const Principal = IDL.Record({ id: IDL.Principal, Principal: IDL.Text })
    const expected = {
      whoami: IDL.Func([], [IDL.Principal], ["query"]),
      get: IDL.Func([Principal], [IDL.Vec(Principal)], ["query"]),
      double: IDL.Func([IDL.Nat], [IDL.Nat], ["query"]),
      notify: IDL.Func([IDL.Func([], [], [])], [], []),
    }

    for (const { idlFactory, init } of [
      loadStrict(js),
      await importCandidDefinition(js),
    ]) {
      const service = idlFactory({ IDL })
      for (const [name, func] of Object.entries(expected)) {
        expect(method(service, name).display()).toBe(func.display())
      }
      expect(init?.({ IDL }).map((type) => type.display())).toEqual([
        IDL.Vec(Principal).display(),
      ])
    }
  })

  it("keeps its name when a global the output uses has it, and reaches the global through globalThis", () => {
    const source = `
      type Array = record { items : vec text };
      type Uint8Array = text;
      service : { put : (Array, blob, Uint8Array) -> (vec nat16) }
    `
    const output = parser.didToTs(source)

    expect(output)
      .toBe(`import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface Array { 'items' : globalThis.Array<string> }
export type Uint8Array = string;
export interface _SERVICE {
  'put' : ActorMethod<
    [Array, globalThis.Uint8Array | number[], Uint8Array],
    Uint16Array | number[]
  >,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`)
    expect(
      typeErrors({
        "globals.d.ts": output,
        "globals.js": parser.didToJs(source),
        "globals-consumer.ts": `
          import type { _SERVICE, Array, Uint8Array } from "./globals.js"

          declare const service: _SERVICE
          const list: Array = { items: ["a"] }
          const text: Uint8Array = "text"

          export const put: Promise<Uint16Array | number[]> = service.put(
            list,
            new globalThis.Uint8Array([1]),
            text
          )
        `,
      })
    ).toEqual([])
  })

  // Only type names clash. A field, a method or a comment may use the names,
  // and the output of a file whose types don't is what it always was.
  it("changes nothing when only a field, a method or a comment has the name", () => {
    const source = `
      // Principal, ActorMethod, IDL and Array, in a comment.
      type Account = record { "Principal" : principal; "IDL" : text; "Array" : vec text };
      service : { "ActorMethod" : (Account) -> (principal) query }
    `

    expect(parser.didToTs(source))
      .toBe(`import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

/**
 * Principal, ActorMethod, IDL and Array, in a comment.
 */
export interface Account {
  'IDL' : string,
  'Principal' : Principal,
  'Array' : Array<string>,
}
export interface _SERVICE { 'ActorMethod' : ActorMethod<[Account], Principal> }
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`)
    expect(parser.didToJs(source))
      .toBe(`export const idlFactory = ({ IDL }) => {
  const Account = IDL.Record({
    'IDL' : IDL.Text,
    'Principal' : IDL.Principal,
    'Array' : IDL.Vec(IDL.Text),
  });
  return IDL.Service({
    'ActorMethod' : IDL.Func([Account], [IDL.Principal], ['query']),
  });
};
export const init = ({ IDL }) => { return []; };`)
  })
})
