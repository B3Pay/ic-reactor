import { Controller } from "react-hook-form"
import { useState } from "react"

interface LabelEditorProps {
  registerName: string
  label: string
}

const LabelEditor: React.FC<LabelEditorProps> = ({ registerName, label }) => {
  const [editing, setEditing] = useState(false)
  const [editedLabel, setEditedLabel] = useState<string>()
  console.log("LabelEditor", { registerName, label })
  return (
    <Controller
      name={`input.${registerName}`}
      render={({ field: { onChange, value } }) => (
        <div className="mb-1">
          {!editing ? (
            <div className="flex items-baseline">
              <label htmlFor={registerName} className="block">
                {value}
              </label>
              <button
                onClick={() => setEditing(true)}
                aria-label="Edit field"
                type="button"
                className="h-5 rounded px-1"
              >
                <span className="w-4 h-4">✎</span>
              </button>
            </div>
          ) : (
            <div className="flex space-x-1">
              <input
                value={editedLabel || value || ""}
                onChange={(e) => setEditedLabel(e.target.value)}
                type="text"
                placeholder="Edit label"
                className="flex-grow w-full h-6 px-2 rounded border"
              />
              <button
                type="button"
                className="bg-white rounded h-6 px-2 text-green-500"
                onClick={() => {
                  onChange(editedLabel)
                  setEditing(false)
                }}
              >
                ✔
              </button>
              <button
                type="button"
                className="bg-white rounded h-6 px-2 text-red-500"
                onClick={() => {
                  setEditedLabel(label)
                  setEditing(false)
                }}
              >
                ✖
              </button>
            </div>
          )}
        </div>
      )}
    />
  )
}

export default LabelEditor
