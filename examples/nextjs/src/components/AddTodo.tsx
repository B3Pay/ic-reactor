import React, { useState } from "react"
import { useUpdateCall } from "service/hello"

interface AddTodoProps {}

const AddTodo: React.FC<AddTodoProps> = ({}) => {
  const { call, error, loading } = useUpdateCall({
    functionName: "addTodo"
  })

  const [name, setName] = useState("")

  function onChangeName(e: React.ChangeEvent<HTMLInputElement>) {
    const newName = e.target.value
    setName(newName)
  }

  return (
    <div>
      <section>
        <h2>AddTodo</h2>
        <label htmlFor="name">Enter your name: &nbsp;</label>
        <input
          id="name"
          alt="Name"
          type="text"
          value={name}
          onChange={onChangeName}
        />
        <button onClick={() => call([name])}>Send</button>
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
