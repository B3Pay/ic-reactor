import { idlFactory, candid } from "./declarations/candid"
import Form from "./components/Form"
import { createReActor } from "@ic-reactor/react"
import { ReActorMethodField } from "@ic-reactor/store"

export type CandidMethod = typeof candid
export type DynamicField = ReActorMethodField<CandidMethod>

export const { useActorStore, useQueryCall } = createReActor<CandidMethod>({
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  idlFactory,
  host: "https://localhost:4943",
})

const App: React.FC = () => {
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
