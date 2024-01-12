import { ActorProvider, AgentProvider, useActor } from "@ic-reactor/react"
import MethodForm from "./components/Candid"
import { ExtractedFunction } from "@ic-reactor/store"
import { useForm } from "react-hook-form"
import { useState } from "react"
import { CandidType } from "./actor"

const DynamicCandid: React.FC = () => {
  const [canisterId, setCanisterId] = useState("ss2fx-dyaaa-aaaar-qacoq-cai")
  const { register, handleSubmit } = useForm({
    shouldUseNativeValidation: true,
    shouldUnregister: true,
    defaultValues: {
      canisterId,
    },
  })

  const onSubmit = async (data: any) => {
    setCanisterId(data.canisterId)
  }

  return (
    <div className="py-2">
      <div className="flex justify-center">
        <form onSubmit={handleSubmit(onSubmit)}>
          <input
            className="border p-2 rounded mr-2 w-80"
            {...register("canisterId", {
              required: "Required",
            })}
          />
          <button className="border p-2 rounded" type="submit">
            Submit
          </button>
        </form>
      </div>
      <AgentProvider withDevtools>
        <ActorProvider canisterId={canisterId} withDevtools>
          <CandidForm />
        </ActorProvider>
      </AgentProvider>
    </div>
  )
}

export default DynamicCandid

const CandidForm: React.FC = () => {
  const { useMethodFields, useActorStore } = useActor<CandidType>()

  const methodFields = useMethodFields()
  const { canisterId, initializing } = useActorStore()

  return (
    <div className="p-2 max-w-3xl mx-auto">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">
          {initializing
            ? "Initializing..."
            : `Canister ID: ${canisterId.toString()}`}
        </h1>
      </div>
      {methodFields.map((field) => (
        <FormFields {...field} key={field.functionName} />
      ))}
    </div>
  )
}

const FormFields: React.FC<ExtractedFunction<CandidType>> = ({
  functionName,
  ...rest
}) => {
  const { useQueryCall } = useActor()

  const { call, data, loading, error } = useQueryCall({
    functionName,
  })

  return (
    <div>
      <MethodForm callHandler={call} functionName={functionName} {...rest} />
      <div className="overflow-auto">
        {error && (
          <fieldset className="border p-2 my-2 text-red-500 border-red-500 rounded">
            <legend className="font-semibold">Error</legend>
            <span className="text-sm">
              <div>{error.message}</div>
            </span>
          </fieldset>
        )}
        {loading && (
          <fieldset className="border p-2 my-2 rounded">
            <legend className="font-semibold">Loading</legend>
            <span className="text-sm">Calling...</span>
          </fieldset>
        )}
        {data ? (
          <fieldset className="border p-2 my-2 rounded">
            <legend className="font-semibold">Results</legend>
            <span className="text-sm">
              {!data ? (
                <div>Calling...</div>
              ) : (
                JSON.stringify(
                  data,
                  (_, value) =>
                    typeof value === "bigint" ? value.toString() : value,
                  2
                )
              )}
            </span>
          </fieldset>
        ) : null}
      </div>
    </div>
  )
}
