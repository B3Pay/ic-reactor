import React from "react"
import { useQueryTodo } from "service/todo"
import Todo from "./Todo"

interface TodosProps {}

const Todos: React.FC<TodosProps> = () => {
  const { data, error, loading } = useQueryTodo({
    functionName: "getAllTodos",
    refetchOnMount: true,
    refetchInterval: 5000
  })

  return (
    <div>
      <section>
        <label>Todos: {loading ? "Loading..." : null}</label>
        {error ? <span>Error: {JSON.stringify(error)}</span> : null}
        {data && data[0] && data[0].length > 0
          ? data[0].map(todo => <Todo {...todo} key={todo.id.toString()} />)
          : null}
      </section>
    </div>
  )
}

export default Todos
