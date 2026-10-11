// STUB (FOUNDATION): the signatures are the contract; B4 implements them.
import type { CanisterInterface, InterfacePayload } from "./types.ts"

/**
 * The interface payload of a canister, on either side: a registry entry gives
 * a typed payload, any other canister goes through the `fetchInterface`
 * server function. Never throws: failures are `{ ok: false }` payloads.
 */
export async function loadInterfacePayload(
  canisterId: string
): Promise<InterfacePayload> {
  return {
    ok: false,
    canisterId,
    code: "network",
    message: "not implemented",
  }
}

/**
 * Rebuilds the interface from a payload (`schemaFromContract` for runtime
 * interfaces, the module's actor for typed ones). Memoized by `didSha256`:
 * the same did gives the same object, so `client.canister()` objects stay
 * stable across renders.
 */
export function interfaceFromPayload(
  p: Extract<InterfacePayload, { ok: true }>
): CanisterInterface {
  void p
  throw new Error("not implemented")
}

/** `interfaceFromPayload` for components; `undefined` for a failed payload. */
export function useCanisterInterface(
  p: InterfacePayload
): CanisterInterface | undefined {
  void p
  return undefined
}
