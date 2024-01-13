import Route, { RouteProps } from "."
import LabelEditor from "../../FormBuilder/LabelEditor"

export interface RecordProps extends RouteProps<"record"> {}

const Record: React.FC<RecordProps> = ({
  extractedField,
  errors,
  registerName,
}) => {
  return (
    <div className="w-full">
      <LabelEditor
        className="font-bold"
        registerName={`record.${registerName}`}
        label={extractedField.label}
      />
      <div className="border-l-2 border-gray-400 ml-2 pl-2">
        {extractedField.fields.map((field, index) => (
          <Route
            key={index}
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
