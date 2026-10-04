"use client"

// The SSR guide's `@/components/LedgerCard`: the same component the guide shows
// as src/components/LedgerCard.tsx. Keep the two in step.
import { useClient } from "@ic-reactor/react"
import { useQuery } from "@tanstack/react-query"
import { actor, type Actor } from "../canisters/icrc1"

export function LedgerCard({ id }: { id: string }) {
  const client = useClient()
  const ledger = client.canister<Actor>(actor, { id })
  const symbol = useQuery({
    ...client.queryOptions(ledger, "icrc1_symbol"),
    staleTime: 60_000,
  })
  const fee = useQuery({
    ...client.queryOptions(ledger, "icrc1_fee"),
    staleTime: 60_000,
  })
  return (
    <section>
      <h2>{symbol.data ?? "…"}</h2>
      <p>Fee: {fee.data?.toString() ?? "…"}</p>
    </section>
  )
}
