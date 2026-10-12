import { Link } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { EmptyState } from "../EmptyState.tsx"

/** What the canister route puts in `notFound({ data })`. */
export interface CanisterNotFoundData {
  code: string
  message: string
}

function isNotFoundData(data: unknown): data is CanisterNotFoundData {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as { code?: unknown }).code === "string" &&
    typeof (data as { message?: unknown }).message === "string"
  )
}

const TITLE: Readonly<Record<string, string>> = {
  invalid_canister_id: "Not a canister id",
  not_a_canister: "A principal, but not a canister",
  management_canister: "The management canister",
  canister_not_found: "No canister at this id",
}

/**
 * The canister route's 404: the id text is not a canister id, is the
 * management canister, or names no canister on mainnet. Says which.
 */
export function CanisterNotFound({
  canisterId,
  data,
}: {
  canisterId: string
  data: unknown
}): ReactElement {
  const known = isNotFoundData(data) ? data : undefined
  return (
    <EmptyState
      code="404"
      headingLevel={1}
      title={(known && TITLE[known.code]) ?? "Canister not found"}
      actions={
        <>
          <Link to="/" className="btn btn-primary">
            Pick a canister
          </Link>
          <Link to="/playground" className="btn">
            Paste a .did instead
          </Link>
        </>
      }
    >
      <p className="mono break-all">{canisterId}</p>
      {known !== undefined && <p>{known.message}</p>}
    </EmptyState>
  )
}
