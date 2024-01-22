import Route, { RouteProps } from "./Route"

export interface RecordProps extends RouteProps<"record"> {}

const Record: React.FC<RecordProps> = ({
  extractedField,
  errors,
  registerName,
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
            registerName={`${registerName}.${field.label}`}
            extractedField={field}
            errors={errors?.[field.label as never]}
          />
        ))}
      </div>
    </div>
  )
}

export default Record
