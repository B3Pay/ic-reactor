import MethodForm from "./components/Candid"
import { useMethodNames, useMethodCall, CandidType } from "./actor"
import { ServiceMethodType } from "@ic-reactor/react/dist/types"

const Candid: React.FC = () => {
  const methodNames = useMethodNames()

  return (
    <div className="p-2 max-w-3xl mx-auto">
      {methodNames.map(([type, functionName]) => (
        <FormFields
          key={functionName}
          functionName={functionName}
          type={type}
        />
      ))}
    </div>
  )
}

interface FormFieldProps {
  type: ServiceMethodType
  functionName: keyof CandidType
}

const FormFields: React.FC<FormFieldProps> = ({ functionName, type }) => {
  const { call, data, loading, error, field } = useMethodCall({
    type,
    functionName,
  })

  return (
    <div>
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
    </div>
  )
}

export default Candid
