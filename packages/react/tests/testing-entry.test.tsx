/**
 * `@ic-reactor/react/testing` re-exports `@ic-reactor/core/testing` for an
 * app that depends on `@ic-reactor/react` alone, which a strict install does
 * not let import `@ic-reactor/core/testing` itself. These tests pin that it
 * carries the same bindings, that no app entry reaches it, and that the hooks
 * run end to end against the canisters it builds.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { QueryClient } from "@tanstack/react-query"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import * as coreTesting from "@ic-reactor/core/testing"
import {
  ClientManager,
  DisplayReactor,
  Reactor,
  isCanisterError,
} from "@ic-reactor/core"
import { createActorHooks } from "../src/createActorHooks.js"
import { defineReactor } from "../src/defineReactor.js"
import * as testing from "../src/testing.js"
import {
  createTestCanister,
  installFakeReplica,
  type FakeReplica,
} from "../src/testing.js"

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..")

describe("the testing entry", () => {
  it("re-exports @ic-reactor/core/testing, binding for binding", () => {
    expect(Object.keys(testing).sort()).toEqual(Object.keys(coreTesting).sort())
    for (const [name, value] of Object.entries(coreTesting)) {
      expect((testing as Record<string, unknown>)[name], name).toBe(value)
    }
  })

  it("is exported as ./testing", () => {
    const manifest = JSON.parse(
      readFileSync(join(PKG_DIR, "package.json"), "utf8")
    ) as { exports: Record<string, unknown> }

    expect(manifest.exports["./testing"]).toEqual({
      types: "./dist/testing.d.ts",
      import: "./dist/testing.js",
      default: "./dist/testing.js",
    })
  })

  it("is imported by neither the main entry nor the react-server entry", () => {
    // Relative imports followed through the package's sources, as in
    // server-entry.test.ts, collecting every specifier the graph names.
    const specifiersUnder = (entry: string) => {
      const seen = new Set<string>()
      const named = new Set<string>()
      const visit = (file: string) => {
        if (seen.has(file)) return
        seen.add(file)
        const source = readFileSync(file, "utf8")
        for (const [, specifier] of source.matchAll(
          /(?:from|import)\s*\(?\s*["']([^"']+)["']/g
        )) {
          named.add(specifier)
          if (!specifier.startsWith(".")) continue
          const target = resolve(dirname(file), specifier.replace(/\.js$/, ""))
          const found = [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`]
          const next = found.find((candidate) => existsSync(candidate))
          if (next) visit(next)
        }
      }
      visit(join(PKG_DIR, entry))
      return [...named]
    }

    for (const entry of ["src/index.ts", "src/server.ts"]) {
      const specifiers = specifiersUnder(entry)
      expect(specifiers).toContain("@ic-reactor/core")
      expect(
        specifiers.filter((specifier) => /testing/.test(specifier)),
        entry
      ).toEqual([])
    }
  })
})

interface Counter {
  count: ActorMethod<[], bigint>
  add: ActorMethod<[bigint], { Ok: bigint } | { Err: { TooLarge: bigint } }>
}

const counterInterface: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    count: IDL.Func([], [IDL.Nat], ["query"]),
    add: IDL.Func(
      [IDL.Nat],
      [IDL.Variant({ Ok: IDL.Nat, Err: IDL.Variant({ TooLarge: IDL.Nat }) })],
      []
    ),
  })

const COUNTER = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

describe("the hooks on a test canister", () => {
  let replica: FakeReplica
  let counts: Map<string, bigint>

  beforeEach(() => {
    counts = new Map()
    replica = installFakeReplica({
      canisters: {
        [COUNTER]: createTestCanister<Counter>(counterInterface, {
          count: (_args, { caller }) => counts.get(caller.toText()) ?? 0n,
          add: ([amount], { caller }) => {
            if (amount > 100n) return { Err: { TooLarge: 100n } }
            const next = (counts.get(caller.toText()) ?? 0n) + amount
            counts.set(caller.toText(), next)
            return { Ok: next }
          },
        }),
      },
    })
  })

  afterEach(() => {
    replica.restore()
  })

  const clientManager = () =>
    new ClientManager({
      queryClient: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
      agentOptions: { host: replica.host },
    })

  it("query, mutate and invalidate through a Reactor, as the signed-in caller", async () => {
    const user = Ed25519KeyIdentity.generate()
    const manager = clientManager()
    manager.updateAgent(user)
    const reactor = new Reactor<Counter>({
      clientManager: manager,
      name: "counter",
      canisterId: COUNTER,
      idlFactory: counterInterface,
    })
    const { useActorQuery, useActorMutation } = createActorHooks(reactor)
    const countKey = reactor.generateQueryKey({ functionName: "count" })

    const { result } = renderHook(() => ({
      count: useActorQuery({ functionName: "count" }),
      add: useActorMutation({
        functionName: "add",
        invalidateQueries: [countKey],
      }),
    }))
    await waitFor(() => expect(result.current.count.data).toBe(0n))

    await act(() => result.current.add.mutateAsync([5n]))
    await waitFor(() => expect(result.current.count.data).toBe(5n))

    await act(() =>
      result.current.add.mutateAsync([500n]).catch(() => undefined)
    )
    await waitFor(() => expect(result.current.add.isError).toBe(true))
    expect(isCanisterError(result.current.add.error)).toBe(true)
    expect(
      isCanisterError(result.current.add.error) && result.current.add.error.code
    ).toBe("TooLarge")
    // Counted for the principal the agent signed as.
    expect([...counts]).toEqual([[user.getPrincipal().toText(), 5n]])
  })

  it("answer a reactor defineReactor builds with no host, at the page's origin", async () => {
    // The app pattern the kit has to serve with no configuration: in jsdom a
    // ClientManager with no host calls the page's origin, and so does a fake
    // installed with none.
    replica.restore()
    replica = installFakeReplica({
      canisters: {
        [COUNTER]: createTestCanister<Counter>(counterInterface, {
          count: () => 7n,
        }),
      },
    })
    expect(replica.host).toBe(window.location.origin)
    const { useActorQuery, authentication } = defineReactor<Counter>({
      name: "counter",
      canisterId: COUNTER,
      idlFactory: counterInterface,
    })

    try {
      const { result } = renderHook(() =>
        useActorQuery({ functionName: "count" })
      )

      await waitFor(() => expect(result.current.data).toBe(7n))
    } finally {
      authentication.dispose()
    }
  })

  it("query through a DisplayReactor, in its display forms", async () => {
    counts.set("2vxsx-fae", 42n)
    const reactor = new DisplayReactor<Counter>({
      clientManager: clientManager(),
      name: "counter",
      canisterId: COUNTER,
      idlFactory: counterInterface,
    })
    const { useActorQuery } = createActorHooks(reactor)

    const { result } = renderHook(() =>
      useActorQuery({ functionName: "count" })
    )

    await waitFor(() => expect(result.current.data).toBe("42"))
  })
})
