import type { MouseEvent } from "react"

/** The search params that make a method workspace what it is. */
export interface WorkspaceTarget {
  readonly method?: string
  readonly args?: string
  readonly certified?: boolean
}

/**
 * The method workspace's identity, its React key: a new method, link or
 * certified choice starts a fresh runner.
 */
export const workspaceKey = (target: WorkspaceTarget): string =>
  `${target.method ?? ""}\u0000${target.args ?? ""}\u0000${String(target.certified)}`

/**
 * Whether picking `target` while `current` is shown mounts a new workspace.
 * Picking the method already open (with no link arguments) does not, so
 * nothing would take the "just picked" flag it sets.
 */
export const pickMountsWorkspace = (
  current: WorkspaceTarget,
  target: WorkspaceTarget
): boolean => workspaceKey(target) !== workspaceKey(current)

/**
 * Whether a click on a link moves this page. A modified or middle click
 * opens the link in another tab or window, and this page stays as it is.
 */
export const movesThisPage = (event: MouseEvent): boolean =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey
