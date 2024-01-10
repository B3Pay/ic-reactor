import { Controller, useFormContext } from "react-hook-form"
import { cn } from "../utils"

interface LabelEditorProps {
  name: `items.${number}`
}

const LabelEditor: React.FC<LabelEditorProps> = ({ name }) => {
  const { control, watch, setValue } = useFormContext()

  const field = watch(name)

  return (
    <div className="mb-1">
      <div className={field.editing ? "hidden" : ""}>
        <label>{field.label}</label>
        <Controller
          name={`${name}.editing`}
          control={control}
          render={({ field }) => (
            <button
              onClick={() => field.onChange(true)}
              aria-label="Edit field"
              type="button"
              className="ml-1 rounded px-1"
            >
              <span className="w-3 h-3">✎</span>
            </button>
          )}
        />
      </div>
      <Controller
        name={`${name}.editedLabel`}
        control={control}
        render={({ field: editedLabel }) => (
          <div className={cn("flex space-x-1", field.editing ? "" : "hidden")}>
            <input
              {...editedLabel}
              type="text"
              placeholder="Edit label"
              className="flex-grow"
            />
            <button
              type="button"
              className="bg-white rounded px-1 text-green-500"
              onClick={() => {
                setValue(`${name}.label`, editedLabel.value)
                setValue(`${name}.editing`, false)
              }}
            >
              <span className="w-3 h-3">✔</span>
            </button>
            <button
              type="button"
              className="bg-white rounded px-1 text-red-500"
              onClick={() => setValue(`${name}.editing`, false)}
            >
              <span className="w-3 h-3">✖</span>
            </button>
          </div>
        )}
      />
    </div>
  )
}

export default LabelEditor
