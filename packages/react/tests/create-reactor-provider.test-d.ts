/**
 * `useReactor()` returns what the factory built with the factory's own type,
 * so the hooks on it keep their generic signatures: the hand-written
 * forwarders it replaces needed `as any` for that (examples/nextjs).
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ReactElement } from "react"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import type { DisplayReactor, Reactor } from "@ic-reactor/core"
import {
  AuthenticationManager,
  ClientManager,
  createQuery,
  createReactorProvider,
  defineDisplayReactor,
  defineReactor,
  type CreateReactorProviderReturn,
  type DefineReactorResult,
  type ReactorProviderProps,
  type UseAuthReturn,
} from "../src/index.js"

interface Todo {
  id: bigint
  description: string
}

interface TodoService {
  getAllTodos: ActorMethod<[], Todo[]>
  addTodo: ActorMethod<[string], bigint>
}

interface LedgerService {
  icrc1_balance_of: ActorMethod<[Principal], bigint>
}

declare const idlFactory: IDL.InterfaceFactory
declare const clientManager: ClientManager

type TodoResult = DefineReactorResult<
  TodoService,
  "candid",
  Reactor<TodoService, "candid">
>

describe("createReactorProvider", () => {
  it("types useReactor() as the factory's return", () => {
    const { ReactorProvider, useReactor } = createReactorProvider(() =>
      defineReactor<TodoService>({ name: "todo", idlFactory, canisterId: "" })
    )

    expectTypeOf(useReactor()).toEqualTypeOf<TodoResult>()
    expectTypeOf<ReturnType<typeof useReactor>>().toEqualTypeOf<TodoResult>()
    expectTypeOf(ReactorProvider).returns.toEqualTypeOf<ReactElement>()
    expectTypeOf(useReactor("reactor")).toEqualTypeOf<
      Reactor<TodoService, "candid">
    >()
  })

  it("keeps the bound hooks generic over the method", () => {
    const { useReactor } = createReactorProvider(() =>
      defineReactor<TodoService>({ name: "todo", idlFactory, canisterId: "" })
    )
    const { useActorQuery, useActorMutation, useAuth } = useReactor()

    const { data } = useActorQuery({ functionName: "getAllTodos" })
    expectTypeOf(data).toEqualTypeOf<Todo[] | undefined>()

    const { data: count } = useActorQuery({
      functionName: "getAllTodos",
      select: (todos) => todos.length,
    })
    expectTypeOf(count).toEqualTypeOf<number | undefined>()

    const { mutate } = useActorMutation({ functionName: "addTodo" })
    expectTypeOf(mutate).parameter(0).toEqualTypeOf<[string]>()

    expectTypeOf(useAuth()).toEqualTypeOf<UseAuthReturn>()

    // @ts-expect-error not a method of the service
    useActorQuery({ functionName: "getTodo" })
    // @ts-expect-error addTodo takes a string
    useActorMutation({ functionName: "addTodo" }).mutate([1n])
  })

  it("types a record of reactors, managers and query objects per property", () => {
    const { useReactor } = createReactorProvider(() => {
      const todo = defineReactor<TodoService>({
        name: "todo",
        idlFactory,
        canisterId: "",
      })
      const ledger = defineDisplayReactor<LedgerService>({
        name: "ledger",
        idlFactory,
        canisterId: "",
        authentication: todo.authentication,
      })
      const allTodos = createQuery(todo.reactor, {
        functionName: "getAllTodos",
      })
      return { todo, ledger, allTodos, authentication: todo.authentication }
    })

    const { data: balance } = useReactor("ledger").useActorQuery({
      functionName: "icrc1_balance_of",
      args: ["aaaaa-aa"],
    })
    // A display reactor's nat arrives as text.
    expectTypeOf(balance).toEqualTypeOf<string | undefined>()
    expectTypeOf(useReactor("ledger").reactor).toEqualTypeOf<
      DisplayReactor<LedgerService>
    >()

    const { data: todos } = useReactor("allTodos").useQuery()
    expectTypeOf(todos).toEqualTypeOf<Todo[] | undefined>()

    expectTypeOf(
      useReactor("authentication")
    ).toEqualTypeOf<AuthenticationManager>()

    // @ts-expect-error not a property of the value
    useReactor("backend")
  })

  it("takes only children when the factory takes no props", () => {
    const { ReactorProvider } = createReactorProvider(() => ({ clientManager }))

    expectTypeOf(ReactorProvider)
      .parameter(0)
      .toEqualTypeOf<ReactorProviderProps>()
    ReactorProvider({})
    ReactorProvider({ children: null })
    // @ts-expect-error the factory takes no props
    ReactorProvider({ canisterId: "aaaaa-aa" })
  })

  it("requires the props the factory takes", () => {
    const provider = createReactorProvider(
      ({ canisterId }: { canisterId: string }) =>
        defineReactor<TodoService>({ name: "todo", idlFactory, canisterId })
    )

    expectTypeOf(provider).toEqualTypeOf<
      CreateReactorProviderReturn<TodoResult, { canisterId: string }>
    >()
    provider.ReactorProvider({ canisterId: "aaaaa-aa", children: null })
    // @ts-expect-error canisterId is required
    provider.ReactorProvider({})
    // @ts-expect-error canisterId is a string
    provider.ReactorProvider({ canisterId: 1 })
  })

  it("takes only an object as the value", () => {
    // @ts-expect-error a value has to be an object to hold reactors
    createReactorProvider(() => "todo")
  })
})
