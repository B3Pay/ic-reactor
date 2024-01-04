import { ReActorProvider, useReActor } from "@ic-reactor/react"
import Form from "./components/Form"
import { ReActorMethodField } from "@ic-reactor/store"
import { useForm } from "react-hook-form"
import { useState } from "react"

const DynamicCandid: React.FC = () => {
  const [canisterId, setCanisterId] = useState("ss2fx-dyaaa-aaaar-qacoq-cai")
  const { register, handleSubmit } = useForm({
    shouldUseNativeValidation: true,
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
      <ReActorProvider host="https://ic0.app" canisterId={canisterId}>
        <Test />
      </ReActorProvider>
    </div>
  )
}

export default DynamicCandid

const Test: React.FC = () => {
  const { useActorStore } = useReActor()

  const { methodFields } = useActorStore()

  return (
    <div className="p-2 max-w-3xl mx-auto">
      {methodFields.map((field) => (
        <FormFields {...field} key={field.functionName} />
      ))}
    </div>
  )
}

const FormFields: React.FC<ReActorMethodField<any>> = ({
  functionName,
  ...rest
}) => {
  const { useQueryCall } = useReActor()

  const { call, data, loading, error } = useQueryCall({
    functionName,
    disableInitialCall: true,
  })

  return (
    <div>
      <Form callHandler={call} functionName={functionName} {...rest} />
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
  )
}
