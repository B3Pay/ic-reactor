"use client"

import React, { useState } from "react"
import { useTodoReactor } from "./todo-provider"
import { Plus, Check, Square, Trash2, RefreshCw } from "lucide-react"

export default function TodoList() {
  const { useActorQuery, useActorMutation } = useTodoReactor()
  const [newTodoText, setNewTodoText] = useState("")

  // Use reactor queries with TanStack Query integrated hooks
  const {
    data: todos = [],
    error,
    isLoading,
    refetch,
  } = useActorQuery({
    functionName: "getAllTodos",
    refetchOnMount: true,
  })

  // Use reactor mutations
  const { mutate: addTodo, isPending: isAdding } = useActorMutation({
    functionName: "addTodo",
    onSuccess: () => {
      setNewTodoText("")
      refetch()
    },
  })

  const { mutate: toggleTodo } = useActorMutation({
    functionName: "toggleTodo",
    onSuccess: () => {
      refetch()
    },
  })

  const { mutate: clearCompleted, isPending: isClearing } = useActorMutation({
    functionName: "clearComplete",
    onSuccess: () => {
      refetch()
    },
  })

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!newTodoText.trim()) return
    addTodo([newTodoText])
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-xl mx-auto mt-10">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">My Canister Todos</h2>
        <button
          onClick={() => refetch()}
          className="p-2 text-gray-500 hover:text-indigo-600 rounded-full hover:bg-gray-100 transition-colors"
          title="Refresh List"
        >
          🔄
        </button>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          placeholder="What needs to be done?"
          className="flex-1 px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={isAdding}
        />
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center gap-1 transition-colors"
          disabled={isAdding}
        >
          ➕ Add
        </button>
      </form>

      {isLoading ? (
        <p className="text-center text-gray-500 py-4">
          Fetching from replica...
        </p>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-md mb-4 text-center">
          Failed to fetch from canister. Is your replica running?
        </div>
      ) : todos.length === 0 ? (
        <p className="text-center text-gray-500 py-4">
          No tasks found! Enjoy your day.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {todos.map((todo: any) => (
            <li
              key={Number(todo.id)}
              className="py-3 flex items-center justify-between group"
            >
              <button
                onClick={() => toggleTodo([[todo.id]])}
                className="flex items-center gap-3 text-left focus:outline-none"
              >
                {todo.completed ? (
                  <div className="h-5 w-5 bg-green-500 text-white rounded flex items-center justify-center">
                    ✓
                  </div>
                ) : (
                  <div className="h-5 w-5 border-2 border-gray-400 rounded" />
                )}
                <span
                  className={`text-base ${todo.completed ? "line-through text-gray-400" : "text-gray-800"}`}
                >
                  {todo.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {todos.some((t: any) => t.completed) && (
        <button
          onClick={() => clearCompleted([])}
          disabled={isClearing}
          className="mt-6 w-full py-2 bg-gray-50 border border-gray-200 text-gray-600 rounded hover:bg-gray-100 flex items-center justify-center gap-1 text-sm font-medium transition-colors"
        >
          🗑️ Clear Completed Tasks
        </button>
      )}
    </div>
  )
}
