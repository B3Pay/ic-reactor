import { Todo } from "declarations/todo/todo.did"
import { useState } from "react"
import { useMutateTodo } from "service/todo"

interface TodoProps extends Todo {}

const RenderTodo = ({ id, completed, description }: TodoProps) => {
  const { mutate, error, isPending } = useMutateTodo({
    functionName: "toggleTodo"
  })

  const [checked, setChecked] = useState(completed)

  const toggleHandler = async () => {
    setChecked(!checked)
    mutate([id])
  }

  return (
    <div
      onClick={toggleHandler}
      className={`group relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
        checked
          ? "bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10"
          : "bg-slate-700/30 border-slate-600/30 hover:bg-slate-700/50 hover:border-slate-500/50"
      }`}
    >
      {/* Checkbox */}
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={toggleHandler}
          disabled={isPending}
          className="peer sr-only"
        />
        <div
          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 ${
            checked
              ? "bg-linear-to-br from-emerald-500 to-cyan-500 border-emerald-400"
              : "border-slate-500/50 group-hover:border-slate-400/70"
          } ${isPending ? "opacity-50" : ""}`}
        >
          {checked && (
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500">
            #{id.toString()}
          </span>
        </div>
        <p
          className={`text-base transition-all duration-300 ${
            checked ? "text-slate-400 line-through" : "text-white"
          }`}
        >
          {isPending ? (
            <span className="text-slate-400 animate-pulse">Updating...</span>
          ) : (
            description
          )}
        </p>
      </div>

      {/* Status indicator */}
      <div
        className={`flex items-center gap-2 transition-opacity duration-300 ${checked ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}
      >
        <div
          className={`w-2 h-2 rounded-full ${checked ? "bg-emerald-400" : "bg-slate-500"}`}
        />
        <span className="text-xs text-slate-400">
          {checked ? "Done" : "Pending"}
        </span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="absolute -bottom-2 left-4 right-4 px-3 py-2 bg-red-500/90 rounded-lg text-white text-xs shadow-lg">
          {JSON.stringify(error)}
        </div>
      )}
    </div>
  )
}

export default RenderTodo
