/**
 * `defineDisplayReactor` (#746).
 *
 * `defineReactor` picked its reactor class from the `display` flag at run
 * time, so it imported `DisplayReactor` statically, and every bundle that
 * called it carried DisplayReactor and all of zod, `display: false` included.
 * `defineDisplayReactor` builds the DisplayReactor setup in a module of its
 * own, both run one shared implementation, and `display: true` is deprecated
 * in its favour. These tests pin that the new entry point builds the same
 * setup, that the deprecated flag still does, and that the shared
 * implementation stays free of DisplayReactor so the flag can be dropped.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { IDL } from "@icp-sdk/core/candid"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { QueryClient } from "@tanstack/react-query"
import {
  AuthenticationManager,
  ClientManager,
  DisplayReactor,
  IdentityAttributesManager,
  Reactor,
  defineDisplayReactor,
  defineReactor,
  reactorRetry,
} from "../src/index.js"
import type { DefineReactorSharedParameters } from "../src/index.js"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_balance: IDL.Func([IDL.Principal], [IDL.Nat], ["query"]),
  })

interface Service {
  get_balance: ActorMethod<[unknown], bigint>
}

const base = {
  name: "ledger",
  idlFactory,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
}

describe("defineDisplayReactor", () => {
  it("builds a DisplayReactor with its hooks and infrastructure", () => {
    const result = defineDisplayReactor<Service>(base)

    expect(result.reactor).toBeInstanceOf(DisplayReactor)
    expect(result.clientManager).toBeInstanceOf(ClientManager)
    expect(result.reactor.clientManager).toBe(result.clientManager)
    expect(result.queryClient).toBe(result.clientManager.queryClient)
    // The QueryClient defineReactor creates stops retrying deterministic
    // failures; this one is the same.
    expect(result.queryClient.getDefaultOptions().queries?.retry).toBe(
      reactorRetry
    )
    for (const hook of [
      "useActorQuery",
      "useActorMutation",
      "useActorSuspenseQuery",
      "useActorInfiniteQuery",
      "useActorSuspenseInfiniteQuery",
      "useActorMethod",
      "useAuth",
      "useAgentState",
      "useUserPrincipal",
      "useIdentityAttributes",
    ] as const) {
      expect(typeof result[hook], hook).toBe("function")
    }
  })

  it("builds the auth managers on first use, once", () => {
    const result = defineDisplayReactor<Service>(base)

    expect(
      Object.getOwnPropertyDescriptor(result, "authentication")?.get
    ).toBeTypeOf("function")
    expect(result.authentication).toBeInstanceOf(AuthenticationManager)
    expect(result.authentication).toBe(result.authentication)
    expect(result.authentication.clientManager).toBe(result.clientManager)
    expect(result.identityAttributes).toBeInstanceOf(IdentityAttributesManager)
  })

  it("forwards validators to the DisplayReactor", () => {
    const { reactor } = defineDisplayReactor<Service>({
      ...base,
      validators: { get_balance: () => ({ success: true }) },
    })

    expect(reactor.hasValidator("get_balance")).toBe(true)
  })

  it("shares a defineReactor reactor's agent and Internet Identity session", () => {
    const raw = defineReactor<Service>(base)
    const display = defineDisplayReactor<Service>({
      ...base,
      name: "ledger-display",
      authentication: raw.authentication,
    })

    expect(display.clientManager).toBe(raw.clientManager)
    expect(display.queryClient).toBe(raw.queryClient)
    expect(display.authentication).toBe(raw.authentication)
  })

  it("applies defineReactor's checks on shared managers", () => {
    const raw = defineReactor<Service>(base)
    const other = new ClientManager({ queryClient: new QueryClient() })

    expect(() =>
      defineDisplayReactor<Service>({
        ...base,
        clientManager: other,
        authentication: raw.authentication,
      })
    ).toThrow(/clientManager/)
    expect(() =>
      defineDisplayReactor<Service>({
        ...base,
        authentication: raw.authentication,
        auth: { derivationOrigin: "https://app.example.com" },
      })
    ).toThrow(/derivationOrigin/)
    expect(() =>
      defineDisplayReactor<Service>({
        ...base,
        clientManager: other,
        allowEnvConfig: true,
      })
    ).toThrow(/allowEnvConfig/)
  })

  it("names the function the app called in those errors", () => {
    const raw = defineReactor<Service>(base)
    const other = new ClientManager({ queryClient: new QueryClient() })
    const refused: Partial<DefineReactorSharedParameters>[] = [
      { clientManager: other, authentication: raw.authentication },
      {
        authentication: raw.authentication,
        auth: { derivationOrigin: "https://app.example.com" },
      },
      { clientManager: other, allowEnvConfig: true },
    ]

    for (const options of refused) {
      // An app that called defineDisplayReactor has no defineReactor call to
      // look for.
      expect(() =>
        defineDisplayReactor<Service>({ ...base, ...options })
      ).toThrow(/^\[ic-reactor\] defineDisplayReactor\("ledger"\) /)
      expect(() => defineReactor<Service>({ ...base, ...options })).toThrow(
        /^\[ic-reactor\] defineReactor\("ledger"\) /
      )
      expect(() =>
        defineReactor<Service>({ ...base, ...options, display: true })
      ).toThrow(/^\[ic-reactor\] defineReactor\("ledger"\) /)
    }
  })
})

describe("defineReactor", () => {
  it("still builds a DisplayReactor for the deprecated display: true", () => {
    const { reactor } = defineReactor<Service>({
      ...base,
      display: true,
      validators: { get_balance: () => ({ success: true }) },
    })

    expect(reactor).toBeInstanceOf(DisplayReactor)
    expect(reactor.hasValidator("get_balance")).toBe(true)
  })

  it("builds a plain Reactor otherwise", () => {
    const { reactor } = defineReactor<Service>(base)

    expect(reactor).toBeInstanceOf(Reactor)
    expect(reactor).not.toBeInstanceOf(DisplayReactor)
  })
})

describe("the implementation defineReactor keeps after display: true", () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src")

  // Read from the emitted JavaScript, not the source: tsc drops an import
  // whose bindings are only used as types, whether or not it says `type`, and
  // only what survives reaches a bundle.
  const CORE_NAMED_IMPORT =
    /^\s*(?:import|export)\s*\{([^}]*)\}\s*from\s*["']@ic-reactor\/core["']/gm
  const CORE_NAMESPACE_IMPORT =
    /^\s*import\s*\*\s*as\s+\w+\s+from\s*["']@ic-reactor\/core["']/m
  const RELATIVE_IMPORT =
    /^\s*(?:import|export)\s*(?:[^"';]*?\s*from\s*)?["'](\.[^"']+)["']/gm

  /**
   * The module files reached from `entry` at run time, and the core bindings
   * each of them imports at run time.
   */
  function runtimeGraph(entry: string) {
    const files = new Map<string, string[]>()
    const visit = (file: string) => {
      if (files.has(file)) return
      const emitted = ts.transpileModule(readFileSync(file, "utf8"), {
        fileName: file,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText
      if (CORE_NAMESPACE_IMPORT.test(emitted)) {
        throw new Error(`${file} imports all of @ic-reactor/core`)
      }
      files.set(
        file,
        [...emitted.matchAll(CORE_NAMED_IMPORT)]
          .flatMap((match) => match[1].split(","))
          .map((binding) => binding.trim().split(/\s+as\s+/)[0])
          .filter(Boolean)
      )
      for (const match of emitted.matchAll(RELATIVE_IMPORT)) {
        const target = resolve(dirname(file), match[1].replace(/\.js$/, ""))
        const found = [
          `${target}.ts`,
          `${target}.tsx`,
          `${target}/index.ts`,
        ].find((candidate) => existsSync(candidate))
        if (!found) throw new Error(`cannot resolve ${match[1]} from ${file}`)
        visit(found)
      }
    }
    visit(join(SRC, entry))
    return files
  }

  const importsDisplayReactor = (graph: Map<string, string[]>) =>
    [...graph.values()].some((bindings) => bindings.includes("DisplayReactor"))

  it("reaches no DisplayReactor, so dropping the flag drops zod", () => {
    // The walk has to find DisplayReactor where it is imported, or the
    // assertion below would pass for a walk that finds nothing.
    expect(importsDisplayReactor(runtimeGraph("defineDisplayReactor.ts"))).toBe(
      true
    )

    const shared = runtimeGraph("defineReactorShared.ts")
    expect(shared.size).toBeGreaterThan(1)
    expect(importsDisplayReactor(shared)).toBe(false)
    expect([...shared.keys()]).not.toContain(join(SRC, "defineReactor.ts"))
    expect([...shared.keys()]).not.toContain(
      join(SRC, "defineDisplayReactor.ts")
    )
  })
})
