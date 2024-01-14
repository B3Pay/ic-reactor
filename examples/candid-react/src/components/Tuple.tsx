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
      <div className="font-semibold">{extractedField.label}</div>
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
  )
}

export default Tuple
