import {
  AgentManager,
  ActorManager,
  ExtractedRecord,
  IDL,
  ExtractedInputField,
} from "../src"
import { idlFactory, b3_system } from "./candid/b3_system"

describe("My IC Store and Actions", () => {
  const agentManager = new AgentManager({
    host: "https://ic0.app",
    withDevtools: false,
  })

  const { serviceFields: methodFields, callMethod } = new ActorManager<
    typeof b3_system
  >({
    agentManager,
    idlFactory,
    canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
  })

  console.log(methodFields)

  it("should return the function fields", () => {
    expect({ methodFields }).toBeDefined()

    methodFields.fields.forEach((field) => {
      expect(field.type).toBeDefined()
      expect(field.validate).toBeDefined()
      expect(field.label).toBeDefined()
      expect(field.defaultValues.data).toBeDefined()
    })

    const testCall = callMethod("version")
    const testField: ExtractedInputField<IDL.BoolClass> = methodFields.fields[0]
    testField.defaultValues
    let testType: ExtractedRecord<IDL.BoolClass> = methodFields.fields

    const [key, value] = Object.entries(testType.defaultValues)[0]
  })
})
