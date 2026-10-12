import { encodeArgs } from "@candid-core/schema/codec"
import type { MethodInfo } from "../interface/types.ts"
import { toVars } from "../lib/reactor.ts"

/**
 * A call as the form submits it, and as it is confirmed and sent: the
 * argument values, the one `vars` value ic-reactor's builders take, and the
 * exact Candid bytes they encode to.
 */
export interface PreparedCall {
  readonly values: readonly unknown[]
  readonly vars: unknown
  readonly bytes: Uint8Array
}

/**
 * The call of `values` (a shared link's, history's), or `undefined` when
 * they do not encode as the method's arguments.
 */
export function prepareCall(
  method: MethodInfo,
  values: readonly unknown[]
): PreparedCall | undefined {
  const encoded = encodeArgs(method.args, values)
  return encoded.ok
    ? { values, vars: toVars(values), bytes: encoded.bytes }
    : undefined
}
