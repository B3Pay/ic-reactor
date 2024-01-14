import { AgentManager, ActorManager } from "../src"
import { idlFactory, b3_system } from "./candid/b3_system"

describe("My IC Store and Actions", () => {
  const agentManager = new AgentManager({
    host: "https://ic0.app",
    withDevtools: false,
  })

  const { serviceFields } = new ActorManager<typeof b3_system>({
    agentManager,
    idlFactory,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

  console.log(serviceFields)

  it("should return the function fields", () => {
    expect({ serviceFields }).toBeDefined()

    serviceFields.methodNames.forEach(([type, name]) => {
      expect(type).toBeDefined()
      expect(name).toBeDefined()

      const { defaultValues, fields, functionName, validate } =
        serviceFields.methods[name]

      expect(defaultValues).toBeDefined()
      expect(fields).toBeDefined()
      expect(functionName).toBeDefined()
      expect(validate).toBeDefined()
    })
  })
})
