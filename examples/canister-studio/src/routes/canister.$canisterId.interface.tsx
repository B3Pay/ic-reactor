import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router"
import type { ReactElement } from "react"
import { z } from "zod"
import { canisterDisplayName } from "../components/canister-names.ts"
import { useCanisterPage } from "../components/canister/use-canister-page.ts"
import { CandidTab } from "../components/interface/CandidTab.tsx"
import { CompatibilityTab } from "../components/interface/CompatibilityTab.tsx"
import { ProjectTab } from "../components/interface/ProjectTab.tsx"
import { TypeScriptTab } from "../components/interface/TypeScriptTab.tsx"
import type { CanisterInterface } from "../interface/types.ts"

const TABS = [
  { key: "candid", label: "Candid" },
  { key: "typescript", label: "TypeScript" },
  { key: "project", label: "Project" },
  { key: "compatibility", label: "Compatibility" },
] as const

type InterfaceTab = (typeof TABS)[number]["key"]

const searchSchema = z.object({
  tab: z
    .enum(["candid", "typescript", "project", "compatibility"])
    .default("candid")
    .catch("candid"),
})

export const Route = createFileRoute("/canister/$canisterId/interface")({
  validateSearch: searchSchema,
  // The default tab stays out of the URL.
  search: { middlewares: [stripSearchParams({ tab: "candid" })] },
  head: ({ params }) => ({
    meta: [
      {
        title: `Interface · ${canisterDisplayName(params.canisterId)} · Canister Studio`,
      },
    ],
  }),
  component: InterfacePage,
})

function InterfacePage(): ReactElement {
  const { tab } = Route.useSearch()
  const { canisterId, payload, iface } = useCanisterPage()
  if (iface === undefined || !payload.ok) return <></>
  return (
    <div className="stack iface-page">
      {/* Links, not buttons: each tab has a URL, and works before hydration. */}
      <nav className="tabs iface-tabs" aria-label="Interface tools">
        {TABS.map((item) => (
          <Link
            key={item.key}
            to="/canister/$canisterId/interface"
            params={{ canisterId }}
            search={{ tab: item.key }}
            className="tab"
            // The router marks the current one aria-current="page". Exact:
            // the Candid link's search is stripped to {}, which a partial
            // match finds in every tab's search.
            activeOptions={{ exact: true }}
            activeProps={{}}
            replace
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="tab-panel">
        <TabBody tab={tab} iface={iface} did={payload.did} />
      </div>
    </div>
  )
}

function TabBody({
  tab,
  iface,
  did,
}: {
  tab: InterfaceTab
  iface: CanisterInterface
  did: string
}): ReactElement {
  switch (tab) {
    case "candid":
      return <CandidTab iface={iface} did={did} />
    case "typescript":
      return <TypeScriptTab iface={iface} />
    case "project":
      return <ProjectTab iface={iface} />
    case "compatibility":
      return <CompatibilityTab iface={iface} />
  }
}
