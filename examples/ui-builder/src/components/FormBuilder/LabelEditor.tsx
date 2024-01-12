import { Controller, useFormContext } from "react-hook-form"
import { cn } from "../../utils"

interface LabelEditorProps {
  label: string
}

const defaultValues = (label: string) => ({
  label,
  editing: false,
  editedLabel: label,
})

const name = "label"

const LabelEditor: React.FC<LabelEditorProps> = ({ label }) => {
  const { setValue, watch } = useFormContext()

  const field = watch(name, defaultValues(label))
  console.log(field)
  return (
    <div className="mb-1">
      <div className={field.editing ? "hidden" : ""}>
        <label>{field.label}</label>
        <Controller
          name={`${name}.editing`}
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

export default LabelEditor
