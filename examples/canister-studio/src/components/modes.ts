import type { MethodMode } from "@candid-core/schema"
import type { CanisterInterface } from "../interface/types.ts"

/** The order modes are listed in everywhere: reads first, then writes. */
export const MODE_ORDER: readonly MethodMode[] = [
  "query",
  "composite_query",
  "update",
  "oneway",
]

export const MODE_LABEL: Readonly<Record<MethodMode, string>> = {
  query: "query",
  composite_query: "composite query",
  update: "update",
  oneway: "oneway",
}

/** How many methods of each mode, in the studio's mode order. */
export function modeCounts(
  methods: CanisterInterface["methods"]
): { mode: MethodMode; count: number }[] {
  const counts = new Map<MethodMode, number>()
  for (const method of methods) {
    counts.set(method.mode, (counts.get(method.mode) ?? 0) + 1)
  }
  return MODE_ORDER.flatMap((mode) => {
    const count = counts.get(mode) ?? 0
    return count === 0 ? [] : [{ mode, count }]
  })
}
