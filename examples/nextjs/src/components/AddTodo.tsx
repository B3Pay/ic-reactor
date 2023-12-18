import React, { useState } from "react"
import { useUpdateCall } from "service/hello"

interface AddTodoProps {}

const AddTodo: React.FC<AddTodoProps> = ({}) => {
  const { call, error, loading } = useUpdateCall({
    functionName: "addTodo"
  })

  const [todo, setTodo] = useState("")

  function onChangeName(e: React.ChangeEvent<HTMLInputElement>) {
    const newName = e.target.value
    setTodo(newName)
  }

  return (
    <div>
      <section>
        <h2>AddTodo</h2>
        <label htmlFor="todo">Todo: &nbsp;</label>
        <input
          id="todo"
          alt="Name"
          type="text"
          value={todo}
          onChange={onChangeName}
        />
        <button onClick={() => call([todo])}>Save</button>
      </section>
      <section>
        <label>Response: &nbsp;</label>
        {loading ? <span>Loading...</span> : null}
        {error ? <span>Error: {JSON.stringify(error)}</span> : null}
      </section>
    </div>
  )
}

export default AddTodo
