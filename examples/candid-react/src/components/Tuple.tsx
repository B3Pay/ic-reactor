import Route, { RouteProps } from "./Route"

export interface TupleProps extends RouteProps<"tuple"> {}

const Tuple: React.FC<TupleProps> = ({
  extractedField,
  registerName,
  errors,
  shouldUnregister,
}) => {
  return (
    <div className="w-full">
      <div>
        <label className="flex-1  w-full block text-lg font-medium">
          {extractedField.label}
        </label>
      </div>
      <div className="border-l-2 border-gray-400 ml-2 pl-2">
        {extractedField.fields.map((field, index) => (
          <Route
            key={index}
            shouldUnregister={shouldUnregister}
            registerName={`${registerName}.[${index}]`}
            errors={errors?.[index as never]}
            extractedField={field}
          />
        ))}
      </div>
    </div>
  )
}

export default Tuple
