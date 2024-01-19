import { AgentManager, ActorManager } from "../src"
import { idlFactory, candid } from "./candid/candid"

describe("My IC Store and Actions", () => {
  const agentManager = new AgentManager({
    host: "https://ic0.app",
    withDevtools: false,
  })

  const { serviceFields } = new ActorManager<typeof candid>({
    agentManager,
    idlFactory,
    withServiceFields: true,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })
  console.log(serviceFields)

  serviceFields!.methodInformation.forEach((label) => {
    it(`should return the method label ${label}`, () => {
      expect(label).toBeDefined()
    })
  })

  it("should return the function fields", () => {
    expect({ serviceFields }).toBeDefined()

    serviceFields!.methodDetails.forEach(({ type, functionName }) => {
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
