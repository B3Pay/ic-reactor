import { createFileRoute, stripSearchParams } from "@tanstack/react-router"
import { useRef, type ReactElement } from "react"
import { MethodList } from "../components/MethodList.tsx"
import { Skeleton } from "../components/Spinner.tsx"
import { MethodOverview } from "../components/canister/MethodOverview.tsx"
import { MethodWorkspace } from "../components/canister/MethodWorkspace.tsx"
import {
  decodeSharedArgs,
  methodSearchSchema,
  readsAtOnce,
  readWithin,
  SHARED_READ_BUDGET_MS,
} from "../components/canister/shared-call.ts"
import { useCanisterPage } from "../components/canister/use-canister-page.ts"
import {
  pickMountsWorkspace,
  workspaceKey,
  type WorkspaceTarget,
} from "../components/canister/workspace-key.ts"
import { canisterDisplayName } from "../components/canister-names.ts"
import { callKindOf } from "../calls/kinds.ts"
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
  // asks for. Only what the runner reads at once (`readsAtOnce`), never a
  // write. The read is bounded and can never fail the page: nothing here
  // throws or rejects.
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
    if (method === undefined) return
    // The runner explains whatever it does not read at once: a query
    // without results, a composite query asked certified, a write.
    if (!readsAtOnce(callKindOf(iface, method), deps.certified)) return
    const args = decodeSharedArgs(method, deps.args)
    if (!args.ok) return

    const { reactor, queryClient } = context
    let options
    try {
      const can = reactor.canister<DynActor>(iface.actor, {
        id: params.canisterId,
        certified: deps.certified,
      })
      options = readQueryOptions(reactor, can, method, toVars(args.values))
    } catch {
      // Options the client refuses are the runner's to explain, never a
      // reason to fail the page.
      return
    }
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
  // Set when the reader picks a method on this page (the list, a quick
  // read); the next workspace takes it once, to bring itself into view.
  const picked = useRef(false)
  if (iface === undefined) return <></>
  const method =
    search.method === undefined ? undefined : iface.method(search.method)
  const onPick = (target: WorkspaceTarget): void => {
    picked.current = pickMountsWorkspace(search, target)
  }
  const wasPicked = (): boolean => {
    const was = picked.current
    picked.current = false
    return was
  }
  return (
    <div className="layout-sidebar canister-workspace">
      <aside className="sidebar" aria-label="Methods">
        <MethodList
          canisterId={iface.canisterId}
          methods={iface.methods}
          selected={method?.name}
          idempotent={iface.registry?.idempotentUpdates}
          certified={search.certified}
          onPick={onPick}
        />
      </aside>
      <div className="content">
        {search.method === undefined ? (
          <MethodOverview iface={iface} onPick={onPick} />
        ) : (
          <MethodWorkspace
            key={workspaceKey(search)}
            iface={iface}
            methodName={search.method}
            method={method}
            argsHex={search.args}
            run={search.run === true}
            certified={search.certified === true}
            wasPicked={wasPicked}
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
