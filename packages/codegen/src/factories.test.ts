import { parseDid } from "@ic-reactor/parser"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import {
  generateFactoriesFile,
  generateReactorEntryFile,
} from "./generators/index.js"
import { getFactoryExportNames } from "./naming.js"
import type { FactoryMethod } from "./types.js"

/** The service methods of `did`, as the pipeline reads them. */
function methodsOf(did: string): FactoryMethod[] {
  return parseDid(did).service?.methods ?? []
}

/**
 * What a generated module imports and exports, read by TypeScript's parser
 * rather than matched as text, so a comment or string cannot pass for either.
 */
function moduleShape(content: string) {
  const file = ts.createSourceFile(
    "factories.ts",
    content,
    ts.ScriptTarget.ES2022
  )
  const imports: string[] = []
  const exports: string[] = []
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.push(element.name.text)
        }
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        exports.push(declaration.name.getText(file))
      }
    }
  }
  return { imports, exports }
}

const BACKEND_DID = `service : {
  get_message : () -> (text) query;
  get_user : (principal) -> (opt record { name : text }) query;
  list_posts : (nat, nat) -> (vec text) composite_query;
  set_message : (text) -> ();
  notify : (text) -> () oneway;
}`

describe("Factories generator", () => {
  it("binds a factory per method to the DisplayReactor by default", () => {
    const content = generateFactoriesFile({
      canisterName: "backend",
      methods: methodsOf(BACKEND_DID),
    })

    expect(content).toMatchSnapshot("display-reactor-factories")
    expect(content).toContain(
      'import { createMutation, createQuery, createQueryFactory } from "@ic-reactor/react"'
    )
    expect(content).toContain(
      'import { backendReactor } from "./index.generated"'
    )
  })

  it("uses createQuery, createQueryFactory or createMutation by the method's annotation and arguments", () => {
    const content = generateFactoriesFile({
      canisterName: "backend",
      methods: methodsOf(BACKEND_DID),
    })

    expect(content).toContain(
      "export const getMessageQuery = /* @__PURE__ */ createQuery(backendReactor, {"
    )
    expect(content).toContain(
      "export const getUserQuery = /* @__PURE__ */ createQueryFactory(backendReactor, {"
    )
    // A composite query is a query too.
    expect(content).toContain(
      "export const listPostsQuery = /* @__PURE__ */ createQueryFactory(backendReactor, {"
    )
    expect(content).toContain(
      "export const setMessageMutation = /* @__PURE__ */ createMutation(backendReactor, {"
    )
    // A oneway method changes state and is never read, so it is an update.
    expect(content).toContain(
      "export const notifyMutation = /* @__PURE__ */ createMutation(backendReactor, {"
    )
  })

  // An update method passed to createQuery is re-run by every refetch,
  // refocus and remount, each time a call that changes state.
  it("never generates an update method as a query", () => {
    const content = generateFactoriesFile({
      canisterName: "backend",
      methods: methodsOf(`service : {
        get_btc_address : (record { owner : opt principal }) -> (text);
        balance : () -> (nat);
      }`),
    })

    expect(content).toContain(
      "export const getBtcAddressMutation = /* @__PURE__ */ createMutation(backendReactor, {"
    )
    expect(content).toContain(
      "export const balanceMutation = /* @__PURE__ */ createMutation(backendReactor, {"
    )
    expect(moduleShape(content)).toEqual({
      imports: ["createMutation", "backendReactor"],
      exports: ["balanceMutation", "getBtcAddressMutation"],
    })
  })

  it("imports only the factories it calls", () => {
    const content = generateFactoriesFile({
      canisterName: "backend",
      methods: methodsOf(`service : { get : () -> (nat) query }`),
    })

    expect(content).toContain('import { createQuery } from "@ic-reactor/react"')
    expect(moduleShape(content).imports).toEqual([
      "createQuery",
      "backendReactor",
    ])
  })

  it("writes an empty module for a service without methods", () => {
    const content = generateFactoriesFile({
      canisterName: "backend",
      methods: [],
    })

    expect(content).toMatchSnapshot("no-methods-factories")
    expect(moduleShape(content)).toEqual({ imports: [], exports: [] })
    expect(content).toContain("export {}")
  })

  it("supports Reactor mode generation", () => {
    const content = generateFactoriesFile({
      canisterName: "workflow_engine",
      methods: methodsOf(BACKEND_DID),
      reactorClass: "Reactor",
    })

    expect(content).toMatchSnapshot("reactor-factories")
    expect(content).toContain(
      'import { workflowEngineReactor } from "./index.generated"'
    )
    expect(content).toContain(
      "export const getMessageQuery = /* @__PURE__ */ createQuery(workflowEngineReactor, {"
    )
  })

  // As the reactor file passes createActorHooks its type arguments for these
  // classes, so TypeScript never infers the service from a subclass of
  // Reactor, the comparison that fails with TS2589 for createActorHooks.
  // generated-types.test.ts compiles both.
  it.each([
    ["CandidReactor", "candid"],
    ["CandidDisplayReactor", "display"],
    ["MetadataDisplayReactor", "metadataDisplay"],
  ] as const)(
    "passes each factory its type arguments for %s",
    (reactorClass, transform) => {
      const content = generateFactoriesFile({
        canisterName: "ledger",
        methods: methodsOf(BACKEND_DID),
        reactorClass,
      })

      expect(content).toContain(
        'import { ledgerReactor, type LedgerService } from "./index.generated"'
      )
      expect(content).toContain(
        `export const getMessageQuery = /* @__PURE__ */ createQuery<LedgerService, "${transform}", "get_message">(ledgerReactor, {`
      )
      expect(content).toContain(
        `export const getUserQuery = /* @__PURE__ */ createQueryFactory<LedgerService, "${transform}", "get_user">(ledgerReactor, {`
      )
      expect(content).toContain(
        `export const setMessageMutation = /* @__PURE__ */ createMutation<LedgerService, "${transform}", "set_message">(ledgerReactor, {`
      )
    }
  )

  it("snapshots a CandidReactor factories file", () => {
    expect(
      generateFactoriesFile({
        canisterName: "ledger",
        methods: methodsOf(`service : {
          icrc1_balance_of : (record { owner : principal }) -> (nat) query;
          icrc1_transfer : (record { amount : nat }) -> (variant { Ok : nat; Err : text });
        }`),
        reactorClass: "CandidReactor",
      })
    ).toMatchSnapshot("candid-reactor-factories")
  })

  it("rejects an unknown reactor class instead of emitting it", () => {
    expect(() =>
      generateFactoriesFile({
        canisterName: "backend",
        methods: [],
        reactorClass: "Nope" as never,
      })
    ).toThrow(/Unknown reactor class "Nope"/)
  })

  it("keeps a method name from closing the comment above its factory", () => {
    const content = generateFactoriesFile({
      canisterName: "backend",
      methods: methodsOf(
        `service : { "a */ export const pwned = 1; /*" : () -> (nat) query }`
      ),
    })

    expect(moduleShape(content).exports).toEqual(["aExportConstPwned_1Query"])
    expect(content).toContain('functionName: "a */ export const pwned = 1; /*"')
  })

  describe("export names", () => {
    const NAMING_DID = `service : {
      "get_thing" : () -> (text) query;
      "getThing" : () -> (text) query;
      "get-thing" : () -> (text) query;
      "if" : () -> (text) query;
      "class" : (nat) -> ();
      "2fa_status" : () -> (bool) query;
      "" : () -> (text) query;
      "create" : (text) -> (nat);
      "Create" : () -> (nat) query;
      "use_backend" : () -> (nat) query;
      "use_backend_method" : () -> (nat);
      "日本" : () -> (text) query;
      "__proto__" : () -> (text) query;
      "icrc1_balance_of" : (principal) -> (nat) query;
    }`

    it("derives a unique identifier for every method name", () => {
      const names = getFactoryExportNames("backend", methodsOf(NAMING_DID))

      // In Candid's order, by the names' UTF-8 bytes.
      expect([...names]).toEqual([
        ["", "Query"],
        ["2fa_status", "_2faStatusQuery"],
        ["Create", "createQuery"],
        ["__proto__", "protoQuery"],
        ["class", "classMutation"],
        ["create", "createMutation"],
        ["get-thing", "getThingQuery"],
        ["getThing", "getThingQuery_"],
        ["get_thing", "getThingQuery__"],
        ["icrc1_balance_of", "icrc1BalanceOfQuery"],
        ["if", "ifQuery"],
        // The canister's hooks keep their names.
        ["use_backend", "useBackendQuery_"],
        // Not the hook `useBackendMethod`: an update method ends in Mutation.
        ["use_backend_method", "useBackendMethodMutation"],
        ["日本", "日本Query"],
      ])
      for (const name of names.values()) {
        expect(name).toMatch(/^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u)
      }
    })

    it("takes names in the order Candid lists the methods, whatever order they come in", () => {
      const methods = methodsOf(NAMING_DID)

      expect([
        ...getFactoryExportNames("backend", [...methods].reverse()),
      ]).toEqual([...getFactoryExportNames("backend", methods)])
    })

    it("avoids a hook of the canister it generates for", () => {
      const methods: FactoryMethod[] = [
        { name: "use_ledger", mode: "query", args: [] },
        { name: "use_ledger_suspense", mode: "query", args: [] },
        { name: "use_ledger_infinite", mode: "query", args: [] },
        { name: "use_ledger_suspense_infinite", mode: "query", args: [] },
      ]

      expect(
        Object.fromEntries(getFactoryExportNames("ledger", methods))
      ).toEqual({
        use_ledger: "useLedgerQuery_",
        use_ledger_infinite: "useLedgerInfiniteQuery_",
        use_ledger_suspense: "useLedgerSuspenseQuery_",
        use_ledger_suspense_infinite: "useLedgerSuspenseInfiniteQuery_",
      })
      expect(
        Object.fromEntries(
          getFactoryExportNames("ledger", [
            { name: "use_ledger", mode: "update", args: [] },
          ])
        )
      ).toEqual({ use_ledger: "useLedgerMutation_" })
    })

    it("imports a factory under an alias when a method's export takes its name", () => {
      const content = generateFactoriesFile({
        canisterName: "backend",
        methods: methodsOf(NAMING_DID),
      })

      expect(content).toMatchSnapshot("naming-factories")
      expect(content).toContain("createMutation as _createMutation")
      expect(content).toContain("createQuery as _createQuery")
      expect(moduleShape(content).imports).toEqual([
        "_createMutation",
        "_createQuery",
        "createQueryFactory",
        "backendReactor",
      ])
      expect(content).toContain(
        "export const createMutation = /* @__PURE__ */ _createMutation(backendReactor, {"
      )
      expect(content).toContain(
        "export const createQuery = /* @__PURE__ */ _createQuery(backendReactor, {"
      )
    })

    it("rejects two methods with one name", () => {
      expect(() =>
        getFactoryExportNames("backend", [
          { name: "get", mode: "query", args: [] },
          { name: "get", mode: "update", args: [] },
        ])
      ).toThrow(/Duplicate method name "get"/)
    })
  })
})

describe("Entry wrapper with factories", () => {
  it("re-exports the factories next to the generated reactor", () => {
    const content = generateReactorEntryFile({ factories: true })

    expect(content).toMatchSnapshot("factories-entry")
    expect(content).toContain('export * from "./index.generated"')
    expect(content).toContain('export * from "./index.factories.generated"')
  })

  it("is the plain wrapper when factories are off", () => {
    expect(generateReactorEntryFile({ factories: false })).toBe(
      generateReactorEntryFile()
    )
    expect(generateReactorEntryFile()).not.toContain(
      "index.factories.generated"
    )
  })

  it("points agents at the consumer skill this repository publishes", () => {
    for (const content of [
      generateReactorEntryFile(),
      generateReactorEntryFile({ factories: true }),
    ]) {
      expect(content).toContain("/plugin marketplace add B3Pay/ic-reactor")
      expect(content).toContain("/plugin install ic-reactor@ic-reactor")
      expect(content).toContain(
        "npx skills add B3Pay/ic-reactor --skill ic-reactor"
      )
      // The separate skills repository holds the contributor hooks skill,
      // not the skill written for apps.
      expect(content).not.toContain("B3Pay/ic-reactor-skills")
    }
  })
})
