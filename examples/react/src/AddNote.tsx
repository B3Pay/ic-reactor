import { useState } from "react"
import { useUpdateCall } from "store"

interface AddNoteProps {
  publicKey: Uint8Array
}

const AddNote: React.FC<AddNoteProps> = ({ publicKey }) => {
  const [input, setInput] = useState("")

  const { call, data, loading, error } = useUpdateCall({
    functionName: "add_simple_note",
    args: [publicKey, input],
  })

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const note = event.target.value

    setInput(note)
  }

  console.log(data, loading, error)

  return (
    <div>
      <h2>Add Note:</h2>
      <div>
        Loading: {loading?.toString()}
        <br />
        Error: {error?.toString()}
        <br />
        Data:{" "}
        {data
          ? JSON.stringify(data, (_, v) =>
              typeof v === "bigint" ? v.toString() : v
            )
          : null}
      </div>
      <input type="text" value={input} name="note" onChange={onInputChange} />
      <button onClick={() => call()}>Add Note</button>
    </div>
  )
}

export default AddNote
