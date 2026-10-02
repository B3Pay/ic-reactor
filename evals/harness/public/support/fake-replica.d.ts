// Types of ./fake-replica.js: a fake Internet Computer replica that answers
// the IC HTTP API through `globalThis.fetch` and signs what a replica signs.
import type { Principal } from "@icp-sdk/core/principal"

export interface FakeCallContext {
  readonly caller: Principal
}
export interface FakeCanister {
  query?(
    method: string,
    arg: Uint8Array,
    context: FakeCallContext
  ): Uint8Array | Promise<Uint8Array>
  update?(
    method: string,
    arg: Uint8Array,
    context: FakeCallContext
  ): Uint8Array | Promise<Uint8Array>
}
export interface FakeReplica {
  readonly host: string
  readonly rootKey: Uint8Array
  restore(): void
}
export function installFakeReplica(options?: {
  host?: string
  canisters?: Record<string, FakeCanister>
}): FakeReplica
