import { Controller } from "react-hook-form"
import { useState } from "react"
import { cn } from "../../utils"

interface LabelEditorProps extends Omit<React.HTMLProps<HTMLDivElement>, "as"> {
  as?: React.ElementType
  registerName: string
  label: string
}

const LabelEditor: React.FC<LabelEditorProps> = ({
  as: Cmp = "div",
  registerName,
  label,
  ...rest
}) => {
  const [editing, setEditing] = useState(false)
  const [editedLabel, setEditedLabel] = useState<string>(label)

  return (
    <Controller
      name={`input.${registerName}`}
      render={({ field: { onChange, value } }) => {
        const editHandler = () => {
          setEditedLabel(value || label)
          setEditing(true)
        }

        const cancelHandler = () => {
          setEditedLabel(label)
          setEditing(false)
        }

        const saveHandler = () => {
          onChange(editedLabel)
          setEditing(false)
        }

        const keyDownHandler = (e: React.KeyboardEvent<HTMLInputElement>) => {
          e.stopPropagation()

          if (e.key === "Enter") {
            saveHandler()
          }
          if (e.key === "Escape") {
            cancelHandler()
          }
        }
        console.log(value)
        return !editing ? (
          <Cmp
            htmlFor={registerName}
            {...rest}
            className={cn("flex items-baseline mr-1", rest.className)}
          >
            {value || label}
            <button
              onClick={editHandler}
              aria-label="Edit field"
              type="button"
              className="h-5 rounded px-1"
            >
              <span className="w-4 h-4">✎</span>
            </button>
          </Cmp>
        ) : (
          <div
            className={cn("flex space-x-1 items-center mr-1", rest.className)}
          >
            <input
              value={editedLabel}
              onChange={(e) => setEditedLabel(e.target.value)}
              onKeyDown={keyDownHandler}
              type="text"
              placeholder="Edit label"
              className="flex-grow w-full h-6 p-1 rounded border"
              autoFocus
            />
            <button
              type="button"
              className="bg-white rounded h-6 w-6 px-1 text-green-500 border border-green-500"
              onClick={() => {
                onChange(editedLabel)
                setEditing(false)
              }}
            >
              ✔
            </button>
            <button
              type="button"
              className="bg-white rounded h-6 w-6 px-1 text-red-500 border border-red-500"
              onClick={cancelHandler}
            >
              ✖
            </button>
          </div>
        )
      }}
    />
  )
}

export default LabelEditor
