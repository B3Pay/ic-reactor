import { idlFactory, b3system } from "./candid/b3system"
import { createReActorStore } from "../src"

describe("My IC Store and Actions", () => {
  const { callMethod, transformResult } = createReActorStore<typeof b3system>({
    idlFactory,
    canisterId: "bkyz2-fmaaa-aaaaa-qaaaq-cai",
    verifyQuerySignatures: false,
    withServiceFields: true,
    isLocalEnv: true,
  })

  it("should transfrom", async () => {
    const data = await callMethod("get_create_canister_app_cycle")
    const trans = transformResult("get_create_canister_app_cycle", data)
    console.log(
      JSON.stringify(
        trans,
        (key, value) =>
          typeof value === "bigint" ? value.toString(10) : value,
        2
      )
    )
    expect(data).toBeDefined()
  })

  it("should transfrom 2", async () => {
    const data = await callMethod("get_apps")
    const trans = transformResult("get_apps", data)
    console.log(
      JSON.stringify(
        trans,
        (key, value) =>
          typeof value === "bigint" ? value.toString(10) : value,
        2
      )
    )
    expect(data).toBeDefined()
  })
})
