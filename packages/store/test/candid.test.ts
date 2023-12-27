import { createReActorStore } from "../src"
import { idlFactory } from "./candid/b3_system"
import { _SERVICE } from "./candid/b3_system/b3_system.did"

describe("My IC Store and Actions", () => {
  const { actorStore } = createReActorStore<_SERVICE>({
    idlFactory,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
    host: "https://icp-api.io",
  })

  it("should return the function fields", () => {
    const fields = actorStore.getState().methodFields
    console.log(fields)
    expect(fields).toBeDefined()
  })
})
