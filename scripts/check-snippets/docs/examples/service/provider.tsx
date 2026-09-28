// `../service/provider` of the nextjs demo: the `src/service/provider.tsx` its
// first example shows.
import { createReactorProvider, defineReactor } from "@ic-reactor/react"
import { canisterId, idlFactory } from "../declarations/todo"
import type { _SERVICE } from "../declarations/todo/todo.did"

export const { ReactorProvider: ICReactorProvider, useReactor: useTodo } =
  createReactorProvider(() =>
    defineReactor<_SERVICE>({
      name: "todo",
      canisterId,
      idlFactory,
      agentOptions: {
        host: process.env.NEXT_PUBLIC_IC_HOST || "http://127.0.0.1:4943",
      },
    })
  )
