import { createFileRoute, stripSearchParams } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { MethodList } from "../components/MethodList.tsx"
import { Skeleton } from "../components/Spinner.tsx"
import { MethodOverview } from "../components/canister/MethodOverview.tsx"
import { MethodWorkspace } from "../components/canister/MethodWorkspace.tsx"
import {
  decodeSharedArgs,
  isReadMode,
  methodSearchSchema,
  readWithin,
  SHARED_READ_BUDGET_MS,
} from "../components/canister/shared-call.ts"
import { useCanisterPage } from "../components/canister/use-canister-page.ts"
import { canisterDisplayName } from "../components/canister-names.ts"
import { readQueryOptions } from "../calls/query-options.ts"
import { interfaceFromPayload } from "../interface/load.ts"
import { toVars, type DynActor } from "../lib/reactor.ts"

export const Route = createFileRoute("/canister/$canisterId/")({
  validateSearch: methodSearchSchema,
  search: {
    middlewares: [stripSearchParams({ run: false, certified: false })],
  },
  loaderDeps: ({ search }) => ({
    method: search.method,
    args: search.args,
    run: search.run === true,
    certified: search.certified === true,
  }),
  // A shared query link (`?method=…&args=<hex>&run=1`): decode the arguments
  // against the method's schemas and read it, so its result is in the
  // server-rendered HTML and hydrates under the very key the page's runner
  // asks for. Only queries and composite queries, never a write. The read
  // is bounded and can never fail the page.
  loader: async ({ context, params, deps, parentMatchPromise }) => {
    if (!deps.run || deps.method === undefined || deps.args === undefined) {
      return
    }
    const parent = await parentMatchPromise
    const payload = parent.loaderData?.payload
    if (payload === undefined || !payload.ok) return
    let iface
    try {
      iface = interfaceFromPayload(payload)
    } catch {
      return
    }
    const method = iface.method(deps.method)
    if (method === undefined || !isReadMode(method.mode)) return
    // A composite query has no certified path: the runner explains it.
    if (deps.certified && method.mode === "composite_query") return
    const args = decodeSharedArgs(method, deps.args)
    if (!args.ok) return

    const { reactor, queryClient } = context
    const can = reactor.canister<DynActor>(iface.actor, {
      id: params.canisterId,
      certified: deps.certified,
    })
    const options = readQueryOptions(reactor, can, method, toVars(args.values))
    const run = () => queryClient.query(options)
    if (typeof document === "undefined") {
      await readWithin(
        queryClient,
        options.queryKey,
        run,
        SHARED_READ_BUDGET_MS
      )
    } else {
      // In the browser the runner shows the read's progress itself.
      run().catch(() => undefined)
    }
  },
  head: ({ match, params }) => {
    const name = canisterDisplayName(params.canisterId)
    const method = match.search.method
    return {
      meta: [
        {
          title:
            method === undefined
              ? `${name} · Canister Studio`
              : `${method} · ${name} · Canister Studio`,
        },
      ],
    }
  },
  // Shown on a client navigation that waits for the parent's interface.
  pendingComponent: MethodsPending,
  component: MethodsPage,
})

function MethodsPage(): ReactElement {
  const search = Route.useSearch()
  const { iface } = useCanisterPage()
  if (iface === undefined) return <></>
  const method =
    search.method === undefined ? undefined : iface.method(search.method)
  return (
    <div className="layout-sidebar canister-workspace">
      <aside className="sidebar" aria-label="Methods">
        <MethodList
          canisterId={iface.canisterId}
          methods={iface.methods}
          selected={method?.name}
          idempotent={iface.registry?.idempotentUpdates}
          certified={search.certified}
        />
      </aside>
      <div className="content">
        {search.method === undefined ? (
          <MethodOverview iface={iface} />
        ) : (
          <MethodWorkspace
            // A new method, link or certified choice starts a fresh runner.
            key={`${search.method}\u0000${search.args ?? ""}\u0000${String(search.certified)}`}
            iface={iface}
            methodName={search.method}
            method={method}
            argsHex={search.args}
            run={search.run === true}
            certified={search.certified === true}
          />
        )}
      </div>
    </div>
  )
}

function MethodsPending(): ReactElement {
  return (
    <div className="layout-sidebar canister-workspace" aria-busy="true">
      <div className="sidebar stack-sm">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} height="1.6rem" />
        ))}
      </div>
      <div className="content stack">
        <Skeleton height="2rem" width="min(320px, 70%)" />
        <Skeleton height="14rem" />
      </div>
    </div>
  )
}
