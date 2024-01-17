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
    withServiceFields: true,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

  console.log(serviceFields)

  it("should return the function fields", () => {
    expect({ serviceFields }).toBeDefined()

    serviceFields!.methods.forEach(({ type, functionName }) => {
      expect(type).toBeDefined()
      expect(functionName).toBeDefined()

      const {
        defaultValues,
        fields,
        functionName: fName,
        validate,
      } = serviceFields!.methodFields[functionName]

      expect(defaultValues).toBeDefined()
      expect(fields).toBeDefined()

      expect(functionName).toBeDefined()
      expect(fName).toBeDefined()
      expect(fName).toEqual(functionName)

      expect(validate).toBeDefined()
    })
  })
})
