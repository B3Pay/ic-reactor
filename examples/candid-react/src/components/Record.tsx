import Route, { RouteProps } from "./Route"

export interface RecordProps extends RouteProps<"record"> {}

const Record: React.FC<RecordProps> = ({
  extractedField,
  errors,
  registerName,
}) => {
  return (
    <div className="w-full">
      <div className="font-semibold">{extractedField.label}</div>
      {extractedField.fields.map((field, index) => (
        <Route
          key={index}
          registerName={`${registerName}.${field.label}`}
          extractedField={field}
          errors={errors?.[field.label as never]}
        />
      ))}
    </div>
  )
}

export default Record
