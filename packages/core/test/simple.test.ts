import { describe, it, expect } from "bun:test"
import { createReactorStore } from "../src"
import { example, canisterId, idlFactory } from "./candid/example"

type Example = typeof example

describe("createReactorStore", () => {
  const { callMethod } = createReactorStore<Example>({
    canisterId,
    idlFactory,
  })

  it("should return actor store", () => {
    expect(callMethod).toBeDefined()
  })
})
