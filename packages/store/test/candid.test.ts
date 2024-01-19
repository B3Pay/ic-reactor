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
  Object.entries(serviceFields!.methodDetails).forEach(([label, details]) => {
    it(`should return the method label ${label}`, () => {
      expect(details).toBeDefined()
    })
  })

  it("should return the function fields", () => {
    expect({ serviceFields }).toBeDefined()

    Object.values(serviceFields!.methodFields).forEach(
      ({ type, functionName }) => {
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
      }
    )
  })
})
