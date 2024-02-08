import {
  AgentManager,
  ActorManager,
  IC_HOST_NETWORK,
  ExtractRandomArgs,
} from "../src"
import { idlFactory, b3system } from "./candid/b3system"

const randomClass = new ExtractRandomArgs()

describe("My IC Store and Actions", () => {
  const agentManager = new AgentManager({
    host: IC_HOST_NETWORK,
    withDevtools: false,
  })

  const { serviceFields } = new ActorManager<typeof b3system>({
    agentManager,
    idlFactory,
    withServiceFields: true,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

  it("should return the service fields", () => {
    Object.entries(serviceFields!.methodFields).map(([label, details]) => {
      const randomData = randomClass.generate(details.returnTypes, label)

      console.log(randomData[label], "\n")
      expect(randomData).toBeDefined()
    })
  })

  // Object.entries(serviceFields!.methodFields).forEach(([label, details]) => {
  //   it(`should return the method label ${label}`, () => {
  //     expect(details).toBeDefined()
  //   })
  // })

  // it("should return the function fields", () => {
  //   expect({ serviceFields }).toBeDefined()

  //   Object.values(serviceFields!.methodFields).forEach(
  //     ({ type, functionName }) => {
  //       expect(type).toBeDefined()
  //       expect(functionName).toBeDefined()

  //       const {
  //         defaultValues,
  //         fields,
  //         functionName: fName,
  //         validate,
  //       } = serviceFields!.methodFields[functionName]

  //       expect(defaultValues).toBeDefined()
  //       expect(fields).toBeDefined()

  //       expect(functionName).toBeDefined()
  //       expect(fName).toBeDefined()
  //       expect(fName).toEqual(functionName)

  //       expect(validate).toBeDefined()
  //     }
  //   )
  // })
})
