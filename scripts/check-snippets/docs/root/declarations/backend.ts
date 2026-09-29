// `./declarations/backend` of the home page: the default app's canister plus
// the `getBalance` and `transfer` its "Best of Both Worlds" example calls.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { _SERVICE as AppService } from "../../../app/declarations/backend"

export * from "../../../app/declarations/backend"

export interface _SERVICE extends AppService {
  getBalance: ActorMethod<[Principal], bigint>
  transfer: ActorMethod<
    [{ to: Principal; amount: bigint }],
    { Ok: bigint } | { Err: string }
  >
}
