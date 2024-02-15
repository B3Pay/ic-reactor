import { createReActorStore } from "@ic-reactor/store"
import { example, canisterId, idlFactory } from "./candid/example"

type Example = typeof example

describe("createReActorStore", () => {
  const { callMethod } = createReActorStore<Example>({
    canisterId,
    idlFactory,
  })

  it("should return actor store", () => {
    expect(callMethod).toBeDefined()
  })
})
