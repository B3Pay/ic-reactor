import MethodForm from "./components/MethodForm"
import { useMethodFields, useMethodCall, CandidType } from "./actor"
import { FunctionType } from "@ic-reactor/react"
import { FormProvider, useForm } from "react-hook-form"

const Candid: React.FC = () => {
  const defaultValues = useMethodFields()

  const { getValues } = useForm({
    mode: "onChange",
    defaultValues,
  })

  const saveForm = () => {
    console.log("saveForm", getValues())
  }

  return (
    <div className="p-2 max-w-3xl mx-auto">
      {defaultValues.map((props) => (
        <FormFields
          key={props.functionName}
          {...props}
          type={props.functionType}
        />
      ))}
      <div className="flex justify-end">
        <button
          className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={saveForm}
        >
          Save
        </button>
      </div>
    </div>
  )
}

interface FormFieldProps {
  type: FunctionType
  functionName: keyof CandidType
}

const FormFields: React.FC<FormFieldProps> = ({ functionName, type }) => {
  const { call, data, loading, error, field } = useMethodCall({
    type,
    functionName,
  })
  console.log("field", field)
  const methods = useForm({
    mode: "onChange",
    defaultValues: field.defaultValues,
  })

  return (
    <FormProvider {...methods}>
      <MethodForm callHandler={call} {...field} />
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
    </FormProvider>
  )
}

export default Candid
