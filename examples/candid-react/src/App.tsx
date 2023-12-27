import { idlFactory, candid } from "./declarations/candid"
import Form from "./components/Form"
import { createReActor } from "@ic-reactor/react"
import { ReActorMethodField } from "@ic-reactor/store"

export const { useActorStore, useQueryCall } = createReActor<typeof candid>({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  host: "https://localhost:4943",
})

export type CandidMethod = typeof candid
export type DynamicField = ReActorMethodField<CandidMethod>

interface CandidProps {}

const App: React.FC<CandidProps> = () => {
  const { methodFields } = useActorStore()

  return (
    <div className="p-2 max-w-3xl mx-auto">
      {/* <TestQuery functionName="complex_recursive" /> */}
      {methodFields.map((field) => (
        <Form {...field} key={field.functionName} />
      ))}
    </div>
  )
}

export default App
