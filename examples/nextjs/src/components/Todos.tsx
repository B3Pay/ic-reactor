import React from "react"
import { useQueryCall } from "service/hello"
import Todo from "./Todo"

interface TodosProps {}

const Todos: React.FC<TodosProps> = ({}) => {
  const { data, error, loading } = useQueryCall({
    functionName: "getAllTodos",
    autoRefresh: true
  })

  return (
    <div>
      <section>
        <label>Todos: &nbsp;</label>
        {loading ? <span>Loading...</span> : null}
        {error ? <span>Error: {JSON.stringify(error)}</span> : null}
        {data && data.length > 0
          ? data.map(([id, todo]) => <Todo {...todo} key={id} id={id} />)
          : null}
      </section>
    </div>
  )
}

export default Todos
