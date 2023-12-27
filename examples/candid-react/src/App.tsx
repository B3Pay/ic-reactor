import { idlFactory, candid } from "./declarations/candid"
import Form from "./components/Form"
import { ExtractedField, UIExtract } from "@ic-reactor/candid"
import { createReActor } from "@ic-reactor/react"
import { useMemo } from "react"
import { Actor } from "@dfinity/agent"
import { FuncClass } from "@dfinity/candid/lib/cjs/idl"

export const { useActorStore, useQueryCall } = createReActor<typeof candid>({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  host: "https://localhost:4943",
})

const generateFields = (fields: [string, FuncClass][]) => {
  const allFunction = fields.map(([functionName, method]) => {
    // Process input types
    const { fields, defaultValues } = method.argTypes.reduce(
      (acc, argType, index) => {
        const field = argType.accept(new UIExtract(), argType.name)
        acc.fields.push(field)
        acc.defaultValues[`${functionName}-arg${index}`] = field.defaultValues
        return acc
      },
      { fields: [] as ExtractedField[], defaultValues: {} as any }
    )

    return {
      functionName,
      fields,
      defaultValues,
    }
  })
  return allFunction
}

interface CandidProps {}

const App: React.FC<CandidProps> = () => {
  const { actor } = useActorStore()

  const allFunction = useMemo(() => {
    if (!actor) return []
    return generateFields(Actor.interfaceOf(actor)._fields)
  }, [actor])

  return (
    <div className="p-2 max-w-3xl mx-auto">
      {allFunction.map((field) => (
        <Form {...field} key={field.functionName} />
      ))}
    </div>
  )
}

export default App
