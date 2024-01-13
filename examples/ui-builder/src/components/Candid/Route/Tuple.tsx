import Route, { RouteProps } from "."
import LabelEditor from "../../FormBuilder/LabelEditor"

export interface TupleProps extends RouteProps<"tuple"> {}

const Tuple: React.FC<TupleProps> = ({
  extractedField,
  registerName,
  errors,
}) => {
  return (
    <div className="w-full">
      <LabelEditor
        registerName={`tuple.${registerName}`}
        label={extractedField.label}
      />
      {extractedField.fields.map((field, index) => (
        <Route
          key={index}
          registerName={`${registerName}.[${index}]`}
          errors={errors?.[index as never]}
          extractedField={field}
        />
      ))}
    </div>
  )
}

export default Tuple
