import {
  createFileRoute,
  notFound,
  Outlet,
  type ErrorComponentProps,
  type NotFoundRouteProps,
} from "@tanstack/react-router"
import type { ReactElement } from "react"
import { CanisterHeader } from "../components/CanisterHeader.tsx"
import { CanisterLoadFailure } from "../components/canister/CanisterLoadFailure.tsx"
import { CanisterNotFound } from "../components/canister/CanisterNotFound.tsx"
import { CanisterPending } from "../components/canister/CanisterPending.tsx"
import { RouteError } from "../components/RouteError.tsx"
import { canisterDisplayName } from "../components/canister-names.ts"
import {
  loadInterfacePayload,
  useCanisterInterface,
} from "../interface/load.ts"
import { checkCanisterId } from "../lib/ids.ts"

// An interface changes only with an upgrade (and the server revalidates it by
// module hash), so moving between methods and tabs never reloads it.
const INTERFACE_STALE_TIME = 5 * 60_000

export const Route = createFileRoute("/canister/$canisterId")({
  // A text that is not a canister id never reaches the loader: it is a 404
  // with the reason, on the server and in the browser alike.
  beforeLoad: ({ params }) => {
    const check = checkCanisterId(params.canisterId)
    if (!check.ok) {
      throw notFound({ data: { code: check.code, message: check.message } })
    }
  },
  // Typed canisters resolve from the registry (no server call); any other
  // goes through the fetchInterface server function. Never throws: a failed
  // load is a payload the page explains.
  loader: async ({ params }) => {
    const payload = await loadInterfacePayload(params.canisterId)
    if (!payload.ok && payload.code === "canister_not_found") {
      throw notFound({ data: { code: payload.code, message: payload.message } })
    }
    return { payload }
  },
  staleTime: INTERFACE_STALE_TIME,
  head: ({ params }) => {
    const name = canisterDisplayName(params.canisterId)
    return {
      meta: [
        { title: `${name} · Canister Studio` },
        {
          name: "description",
          content: `Forms for every method of ${name} (${params.canisterId}) on the Internet Computer, with safe calls.`,
        },
      ],
    }
  },
  pendingComponent: CanisterPending,
  errorComponent: CanisterError,
  notFoundComponent: CanisterNotFoundPage,
  component: CanisterLayout,
})

function CanisterLayout(): ReactElement {
  const { canisterId } = Route.useParams()
  const { payload } = Route.useLoaderData()
  const iface = useCanisterInterface(payload)

  if (!payload.ok) {
    return (
      <div className="page canister-page">
        <CanisterHeader canisterId={canisterId} />
        <CanisterLoadFailure payload={payload} />
      </div>
    )
  }
  return (
    <div className="page canister-page">
      <CanisterHeader canisterId={canisterId} payload={payload} iface={iface} />
      <Outlet />
    </div>
  )
}

function CanisterNotFoundPage({ data }: NotFoundRouteProps): ReactElement {
  const { canisterId } = Route.useParams()
  return <CanisterNotFound canisterId={canisterId} data={data} />
}

function CanisterError(props: ErrorComponentProps): ReactElement {
  return <RouteError {...props} title="This canister page failed to load" />
}
