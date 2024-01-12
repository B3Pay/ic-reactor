import { useFieldArray } from "react-hook-form"
import Route, { RouteProps } from "."
import { cn } from "../../../utils"
import LabelEditor from "../../FormBuilder/LabelEditor"

export interface OptionalProps extends RouteProps<"optional"> {}

const Optional: React.FC<OptionalProps> = ({
  extractedField,
  registerName,
  errors,
}) => {
  const { fields, append, remove } = useFieldArray({
    name: `data.${registerName}` as never,
  })

  return (
    <div className="flex flex-col">
      <div className="flex h-10 justify-between items-center">
        <LabelEditor
          registerName={`optional.${registerName}`}
          label={extractedField.label}
        />
        {/* <label className="flex-1  w-full block text-lg font-medium">
          {extractedField.label}
        </label> */}
        <div className="flex-auto w-18 mt-1">
          <input
            id={registerName}
            className="hidden"
            type="checkbox"
            onClick={() => (fields.length === 0 ? append("") : remove(0))}
          />
          <label
            htmlFor={registerName}
            className={cn(
              "relative inline-block w-12 h-6 rounded-full cursor-pointer transition duration-200",
              fields.length > 0 ? "bg-green-400" : "bg-gray-600"
            )}
          >
            <span
              className={cn(
                "absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform transform",
                fields.length > 0 ? "translate-x-6" : "translate-x-0"
              )}
            />
          </label>
        </div>
      </div>
      {fields.map(({ id }) => (
        <div
          key={id}
          className="flex justify-between items-start p-1 mb-1 w-full border-dashed border border-gray-400 rounded"
        >
          <Route
            extractedField={extractedField.fields?.[0]}
            errors={errors?.[0 as never]}
            registerName={`${registerName}.[0]`}
          />
        </div>
      ))}
    </div>
  )
}
export default Optional
