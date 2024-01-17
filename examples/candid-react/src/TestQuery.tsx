import { FormProvider, useForm } from "react-hook-form"
import { CandidType, useQueryCall } from "./actor"
import Route from "./components/Route"
import { ExtractedFunction } from "@ic-reactor/react/dist/types"

interface TestQueryProps {
  functionName: ExtractedFunction<CandidType>["functionName"]
}

const TestQuery: React.FC<TestQueryProps> = ({ functionName }) => {
  const { data, loading, error, call, field } = useQueryCall({
    functionName,
  })

  console.log("field", field)
  const methods = useForm({
    progressive: false,
    shouldUseNativeValidation: true,
    reValidateMode: "onChange",
    mode: "onChange",
    defaultValues: field.defaultValues,
  })

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit((data) => {
          console.log("data", data)
          const args = (Object.values(data) || []) as [any]
          console.log("args", args)
          call(args)
        })}
        className="border border-gray-500 rounded p-2 mt-2 w-full"
      >
        <h1 className="text-xl font-bold mb-4">{functionName}</h1>
        {field?.fields.map((field, index) => {
          return (
            <div key={index} className="mb-2">
              <Route
                extractedField={field}
                registerName={`arg${index}`}
                errors={methods.formState.errors.data?.[`arg${index}`]}
              />
            </div>
          )
        })}
        {error && <div className="text-red-500 text-sm">{error.message}</div>}
        {loading && <div className="text-sm">Calling...</div>}
        {data ? (
          <div className="text-sm">
            {JSON.stringify(
              data,
              (_, value) =>
                typeof value === "bigint" ? value.toString() : value,
              2
            )}
          </div>
        ) : null}
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          type="submit"
        >
          Submit
        </button>
      </form>
    </FormProvider>
  )
}

export default TestQuery
