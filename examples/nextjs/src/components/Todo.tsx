import { ToDo } from "declarations/hello/hello.did"
import React from "react"
import { useUpdateCall } from "service/hello"

interface TodoProps extends ToDo {
  id: bigint
}

const Todo: React.FC<TodoProps> = ({ id, completed, description }) => {
  const { call, error, loading } = useUpdateCall({
    functionName: "toggleTodo",
    args: [id]
  })

  const [checked, setChecked] = React.useState(completed)

  const toggleHandler = async () => {
    setChecked(!checked)
    await call()
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "5px",
        marginBottom: "5px",
        border: "1px solid black",
        borderRadius: "5px",
        width: "100%",
        backgroundColor: "#f0f0f0"
      }}
      onClick={toggleHandler}
    >
      <input
        style={{ marginRight: "10px", width: "20px", height: "20px" }}
        type="checkbox"
        checked={checked}
        onChange={toggleHandler}
        disabled={loading}
      />
      <span style={{ marginRight: "5px" }}>{id.toString()} -</span>
      <label>{loading ? <span>Loading...</span> : description}</label>
      {error ? <span>Error: {JSON.stringify(error)}</span> : null}
    </div>
  )
}

export default Todo
