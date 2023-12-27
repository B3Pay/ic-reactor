import { Actor } from "@dfinity/agent"
import { createActor } from "./declarations/candid"
import Form from "./components/Form"
import { ExtractedField, UIExtract } from "@ic-reactor/candid"

export const actor = createActor("bkyz2-fmaaa-aaaaa-qaaaq-cai", {
  agentOptions: {
    host: "https://ic0.app",
  },
})

export const actorInterface = Actor.interfaceOf(actor)._fields

const allFunction = actorInterface.map(([methodName, method]) => {
  // Process input types
  const { fields, defaultValues } = method.argTypes.reduce(
    (acc, argType, index) => {
      const field = argType.accept(new UIExtract(), argType.name)
      acc.fields.push(field)
      acc.defaultValues[`${methodName}-arg${index}`] = field.defaultValues
      return acc
    },
    { fields: [] as ExtractedField[], defaultValues: {} as any }
  )

  return {
    methodName,
    fields,
    defaultValues,
  }
})

console.log("field", allFunction)

interface CandidProps {}

const App: React.FC<CandidProps> = () => {
  return (
    <div className="p-2 max-w-3xl mx-auto">
      {allFunction.map((field) => (
        <Form {...field} key={field.methodName} />
      ))}
    </div>
  )
}

export default App
