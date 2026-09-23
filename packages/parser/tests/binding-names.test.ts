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

// candid_parser prints a type named like a JavaScript keyword with a `_`
// appended (`class_`) wherever it declares or refers to it, but wrote the line
// that names the actor's type with the bare name: `return class;` in didToJs
// and `export interface _SERVICE extends class {}` in didToTs. Neither parses,
// so codegen's module did not load, its declarations did not compile, and
// importCandidDefinition threw.
describe("a service type named like a JavaScript keyword", () => {
  const CASES = {
    keyword: {
      did: `
        type class = service { greet : (text) -> (text) query };
        service : class
      `,
      consumer: `
        import type { _SERVICE, class_ } from "./keyword.js"

        declare const service: _SERVICE
        export const greeting: Promise<string> = service.greet("world")
        export const same: class_ = service
      `,
      methods: { greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) },
      init: [] as IDL.Type[],
    },
    // A recursive service is returned through `.getType()`.
    recursive: {
      did: `
        type class = service { next : () -> (class) query };
        service : class
      `,
      consumer: `
        import type { Principal } from "@icp-sdk/core/principal"
        import type { _SERVICE } from "./recursive.js"

        declare const service: _SERVICE
        export const next: Promise<Principal> = service.next()
      `,
      methods: {},
      init: [] as IDL.Type[],
    },
    // `service : (…) -> T` names its service type the same way.
    classActor: {
      did: `
        type default = service { set : (nat) -> () };
        service : (nat) -> default
      `,
      consumer: `
        import type { _SERVICE, default_ } from "./classActor.js"

        declare const service: _SERVICE
        export const set: Promise<undefined> = service.set(1n)
        export const same: default_ = service
      `,
      methods: { set: IDL.Func([IDL.Nat], [], []) },
      init: [IDL.Nat],
    },
    // When another type already has the name, it takes the next free one.
    taken: {
      did: `
        type class = service { put : (class_) -> () };
        type class_ = text;
        service : class
      `,
      consumer: `
        import type { _SERVICE, class_, class__ } from "./taken.js"

        declare const service: _SERVICE
        const text: class_ = "text"
        export const put: Promise<undefined> = service.put(text)
        export const same: class__ = service
      `,
      methods: { put: IDL.Func([IDL.Text], [], []) },
      init: [] as IDL.Type[],
    },
  }

  it("keeps the name candid_parser declares it under, and the actor line refers to it", () => {
    const { did } = CASES.keyword

    expect(parser.didToJs(did)).toBe(`export const idlFactory = ({ IDL }) => {
  const class_ = IDL.Service({
    'greet' : IDL.Func([IDL.Text], [IDL.Text], ['query']),
  });
  return class_;
};
export const init = ({ IDL }) => { return []; };`)
    expect(parser.didToTs(did))
      .toBe(`import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface class_ { 'greet' : ActorMethod<[string], string> }
export interface _SERVICE extends class_ {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`)
  })

  it("gives didToJs output that loads, with the service the Candid declares", async () => {
    for (const { did, methods, init: initTypes } of Object.values(CASES)) {
      const js = parser.didToJs(did)
      for (const { idlFactory, init } of [
        loadStrict(js),
        await importCandidDefinition(js),
      ]) {
        const service = idlFactory({ IDL })
        for (const [name, func] of Object.entries(methods)) {
          expect(method(service, name).display()).toBe(func.display())
        }
        expect(init?.({ IDL }).map((type) => type.display())).toEqual(
          initTypes.map((type) => type.display())
        )
      }
    }

    // The recursive service's method returns the service itself.
    const service = loadStrict(parser.didToJs(CASES.recursive.did)).idlFactory({
      IDL,
    })
    const next = method(service, "next")
    expect(next.annotations).toEqual(["query"])
    expect((next.retTypes[0] as IDL.RecClass).getType()).toBe(service)
  })

  it("gives didToTs output that type-checks with skipLibCheck off", () => {
    const files: Record<string, string> = {}
    for (const [name, { did, consumer }] of Object.entries(CASES)) {
      files[`${name}.d.ts`] = parser.didToTs(did)
      files[`${name}.js`] = parser.didToJs(did)
      files[`${name}-consumer.ts`] = consumer
    }

    expect(typeErrors(files)).toEqual([])
    // A full TypeScript program is checked here; on a busy CI runner that can
    // take longer than vitest's 5 s default.
  }, 30_000)

  // Only the actor's type is renamed. Other types named like a keyword, and
  // fields, methods and comments that are, print what they always printed.
  it("changes nothing when the actor's type is not named like a keyword", () => {
    const source = `
      // class, default and delete, in a comment.
      type class = record { default : text };
      type delete = variant { this; that };
      type classic = service { new : (class) -> (delete) };
      service : classic
    `

    expect(parser.didToJs(source))
      .toBe(`export const idlFactory = ({ IDL }) => {
  const class_ = IDL.Record({ 'default' : IDL.Text });
  const delete_ = IDL.Variant({ 'that' : IDL.Null, 'this' : IDL.Null });
  const classic = IDL.Service({ 'new' : IDL.Func([class_], [delete_], []) });
  return classic;
};
export const init = ({ IDL }) => { return []; };`)
    expect(parser.didToTs(source))
      .toBe(`import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

/**
 * class, default and delete, in a comment.
 */
export interface class_ { 'default' : string }
export interface classic { 'new' : ActorMethod<[class_], delete_> }
export type delete_ = { 'that' : null } |
  { 'this' : null };
export interface _SERVICE extends classic {}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`)
  })
})
