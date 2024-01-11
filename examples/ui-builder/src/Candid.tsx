import MethodForm from "./components/Form"
import { DynamicField, useMethodFields, useQueryCall } from "./actor"

const Candid: React.FC = () => {
  const methodFields = useMethodFields()

  return (
    <div className="p-2 max-w-3xl mx-auto">
      {methodFields.map((field) => (
        <FormFields {...field} key={field.functionName} />
      ))}
    </div>
  )
}

interface FormFieldProps extends DynamicField {}

const FormFields: React.FC<FormFieldProps> = ({ functionName, ...rest }) => {
  console.log("functionName", functionName, rest)

  const { call, data, loading, error } = useQueryCall({
    functionName,
    disableInitialCall: true,
  })

  return (
    <div>
      <MethodForm callHandler={call} functionName={functionName} {...rest} />
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
