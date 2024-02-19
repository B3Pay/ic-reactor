import { FunctionName, FunctionType } from "@ic-reactor/core"
import MethodForm from "./MethodForm"
import { useMethodCall } from "@ic-reactor/react"

export interface FormFieldsProps {
  functionName: FunctionName
  type: FunctionType
}

const MethodCall: React.FC<FormFieldsProps> = ({ functionName, type }) => {
  const { call, data, loading, error, field } = useMethodCall({
    type,
    functionName,
  })

  return (
    <div className="flex flex-col">
      <MethodForm callHandler={call} {...field} />
      <div className="w-full overflow-hidden">
        <fieldset
          className={`border p-2 rounded ${
            loading || error || data ? "" : "hidden"
          }`}
        >
          <legend className="font-semibold">
            {loading ? "Loading" : error ? "Error" : "Results"}
          </legend>
          <p className="text-sm whitespace-pre-wrap overflow-auto max-h-56">
            {loading
              ? "Calling..."
              : error
              ? error.message
              : JSON.stringify(
                  data,
                  (_, value) =>
                    typeof value === "bigint" ? value.toString() : value,
                  2
                )}
          </p>
        </fieldset>
      </div>
    </div>
  )
}

export default MethodCall
