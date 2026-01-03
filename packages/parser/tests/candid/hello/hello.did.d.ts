import type { ActorMethod } from "@icp-sdk/core/agent"

export interface _SERVICE {
  greet: ActorMethod<[string], string>
  greet_update: ActorMethod<[string], string>
}
