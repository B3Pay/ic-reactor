import { Controller, useFormContext } from "react-hook-form"
import { cn } from "../../utils"

interface LabelEditorProps {
  name: `items.${number}`
}

const SimpleLabelEditor: React.FC<LabelEditorProps> = ({ name }) => {
  const { control, watch, setValue } = useFormContext()

  const field = watch(name)
  console.log(field)
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
              className="h-5 rounded px-1"
            >
              <span className="w-4 h-4">✎</span>
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
              className="flex-grow w-full h-6 px-2 rounded border"
            />
            <button
              type="button"
              className="bg-white rounded h-6 px-2 text-green-500"
              onClick={() => {
                setValue(`${name}.label`, editedLabel.value)
                setValue(`${name}.editing`, false)
              }}
            >
              ✔
            </button>
            <button
              type="button"
              className="bg-white rounded h-6 px-2 text-red-500"
              onClick={() => setValue(`${name}.editing`, false)}
            >
              ✖
            </button>
          </div>
        )}
      />
    </div>
  )
}

export default SimpleLabelEditor
