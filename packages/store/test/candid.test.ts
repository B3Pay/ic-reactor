import { createReActorStore } from "../src"
import { idlFactory, b3_system } from "./candid/b3_system"

describe("My IC Store and Actions", () => {
  const { actorStore } = createReActorStore<typeof b3_system>({
    idlFactory,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

  it("should return the function fields", () => {
    const { methodFields } = actorStore.getState()
    console.log({ methodFields })
    expect({ methodFields }).toBeDefined()
  })
})
