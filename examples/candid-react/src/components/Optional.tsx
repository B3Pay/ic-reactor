import { useFieldArray } from "react-hook-form"
import Route, { RouteProps } from "./Route"
import { cn } from "../utils"

export interface OptionalProps extends RouteProps<"optional"> {}

const Optional: React.FC<OptionalProps> = ({
  extractedField,
  registerName,
  errors,
}) => {
  const { fields, insert, remove } = useFieldArray({
    name: registerName as never,
  })

  return (
    <div className="flex flex-col">
      <div className="flex h-10 justify-between items-center">
        <label className="flex-1  w-full block text-lg font-medium">
          {extractedField.label}
        </label>
        <div className="flex-auto w-18 mt-1">
          <label
            htmlFor={registerName}
            className={cn(
              "relative inline-block w-12 h-6 rounded-full cursor-pointer transition duration-200",
              fields.length > 0 ? "bg-green-400" : "bg-gray-600",
              "focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-black"
            )}
          >
            <input
              id={registerName}
              className="sr-only"
              aria-label="toggle"
              type="checkbox"
              checked={fields.length > 0}
              onChange={(e) => {
                if (e.target.checked) {
                  insert(0, extractedField.defaultValues)
                } else {
                  remove(0)
                }
              }}
            />
            <span
              className={cn(
                "absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform transform",
                fields.length > 0 ? "translate-x-6" : "translate-x-0"
              )}
            />
          </label>
        </div>
      </div>
      {fields.map((field, index) => (
        <Route
          key={field.id}
          extractedField={extractedField.fields?.[index]}
          errors={errors?.[index as never]}
          registerName={`${registerName}.[${index}]`}
        />
      ))}
    </div>
  )
}
export default Optional
