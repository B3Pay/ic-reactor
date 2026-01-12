import { useQueryTodo } from "service/todo"
import RenderTodo from "./Todo"

const Todos = () => {
  const { data, error, isPending } = useQueryTodo({
    functionName: "getAllTodos",
    refetchInterval: 5000
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white">Your Tasks</h2>
        </div>

        {/* Task count */}
        {data && data.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-slate-700/50 rounded-full text-sm text-slate-300">
              {data.filter(t => t.completed).length}/{data.length} completed
            </span>
          </div>
        )}
      </div>

      {/* Loading State */}
      {isPending && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-slate-400 text-sm">Loading tasks...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <svg
            className="w-5 h-5 text-red-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-red-300 text-sm">{JSON.stringify(error)}</span>
        </div>
      )}

      {/* Empty State */}
      {data && data.length === 0 && !isPending && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 bg-slate-700/30 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-10 h-10 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-300 mb-1">
            No tasks yet
          </h3>
          <p className="text-slate-500 text-sm max-w-xs">
            Get started by adding your first task above. Your todos will be
            stored on the Internet Computer!
          </p>
        </div>
      )}

      {/* Todo List */}
      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map(todo => (
            <RenderTodo {...todo} key={todo.id.toString()} />
          ))}
        </div>
      )}
    </div>
  )
}

export default Todos
