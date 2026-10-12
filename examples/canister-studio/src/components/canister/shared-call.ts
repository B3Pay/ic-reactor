import { decodeArgs } from "@candid-core/schema/codec"
import type { QueryClient, QueryKey } from "@tanstack/react-query"
import { z } from "zod"
import type { CallKind } from "../../calls/kinds.ts"
import type { MethodInfo } from "../../interface/types.ts"
import { fromHex } from "../../lib/hex.ts"

/**
 * Shared links are read with up to 16 KiB of argument bytes. The links this
 * app writes carry less (`argsFitInUrl` in calls/share.ts): a URL is a
 * request line, and Node refuses one that long.
 */
export const MAX_SHARED_ARGS_BYTES = 16 * 1024

// The router parses each search value as JSON first, so `run=1` arrives as
// the number 1 and a method named `123` as a number: accept those spellings
// and turn them into what the page means.
const flag = z
  .union([
    z.boolean(),
    z.literal(1),
    z.literal(0),
    z.literal("1"),
    z.literal("0"),
    z.literal("true"),
    z.literal("false"),
  ])
  .transform(
    (value) =>
      value === true || value === 1 || value === "1" || value === "true"
  )

const methodName = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((value) => String(value))
  .pipe(z.string().min(1).max(1024))

const argsHex = z
  .string()
  .regex(/^(?:0x)?(?:[0-9a-fA-F]{2})*$/)
  .refine(
    (text) => text.replace(/^0x/i, "").length <= MAX_SHARED_ARGS_BYTES * 2
  )

/**
 * The method workspace's search params. Each falls back to "absent" when
 * it does not parse (`.catch`), so a mangled link opens the page instead of
 * failing it.
 */
export const methodSearchSchema = z.object({
  method: methodName.optional().catch(undefined),
  args: argsHex.optional().catch(undefined),
  run: flag.optional().catch(undefined),
  certified: flag.optional().catch(undefined),
})

/**
 * Whether a link's `run` reads the method at once (and the server prefetches
 * it): only a read as `callKindOf` decides it, a query or composite query
 * with results, and a composite query only off the certified twin, which it
 * does not have. Anything else opens prefilled and waits for a click: a write
 * is never sent from a link, an idempotent update needs a signed-in caller,
 * and a query without results is called, not cached (`queryOptions` refuses
 * it).
 */
export function readsAtOnce(kind: CallKind, certified: boolean): boolean {
  return kind.kind === "read" && (kind.certifiable || !certified)
}

export type SharedArgs =
  | { readonly ok: true; readonly values: readonly unknown[] }
  | { readonly ok: false; readonly message: string }

/**
 * A shared link's argument bytes, decoded against the method's argument
 * schemas: the values a form starts from. Pure and deterministic, so the
 * server's loader and the page (on both sides) reach the same values, and so
 * the same query key.
 */
export function decodeSharedArgs(method: MethodInfo, hex: string): SharedArgs {
  const bytes = fromHex(hex)
  if (bytes === undefined) {
    return { ok: false, message: "The arguments in the link are not hex." }
  }
  if (bytes.length > MAX_SHARED_ARGS_BYTES) {
    return { ok: false, message: "The arguments in the link exceed 16 KiB." }
  }
  const decoded = decodeArgs(method.args, bytes)
  if (!decoded.ok) {
    const first = decoded.issues[0]
    return {
      ok: false,
      message:
        first === undefined
          ? "The arguments in the link do not decode for this method."
          : `The arguments in the link do not decode for this method: ${first.message} (${first.path})`,
    }
  }
  return { ok: true, values: decoded.values }
}

/** How long a server render waits for a shared link's read. */
export const SHARED_READ_BUDGET_MS = 4_000

/**
 * Waits for a read (`run()`, which starts it) at most `budgetMs`. Never
 * throws. A read still running at the deadline is cancelled, so it is not
 * sent to the browser half done: the page reads it again itself after
 * hydrating, and shows the real error if it fails.
 */
export async function readWithin(
  queryClient: QueryClient,
  queryKey: QueryKey,
  run: () => Promise<unknown>,
  budgetMs: number
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), budgetMs)
  })
  try {
    const outcome = await Promise.race([
      run().then(
        () => "settled" as const,
        () => "settled" as const
      ),
      deadline,
    ])
    if (outcome === "late") await queryClient.cancelQueries({ queryKey })
  } finally {
    clearTimeout(timer)
  }
}
