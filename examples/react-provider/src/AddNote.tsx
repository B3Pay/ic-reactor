import { jsonToString } from "@ic-reactor/react/dist/utils"
import { useNoteUpdateCall } from "NoteActor"
import { useState } from "react"

interface AddNoteProps {
  publicKey: Uint8Array
}

const AddNote: React.FC<AddNoteProps> = ({ publicKey }) => {
  const [input, setInput] = useState("")

  const { call, data, loading, error } = useNoteUpdateCall({
    functionName: "add_simple_note",
    args: [publicKey, input],
  })

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const note = event.target.value

    setInput(note)
  }

  return (
    <div>
      <h2>Add Note:</h2>
      <div>
        Loading: {loading?.toString()}
        <br />
        Error: {error?.toString()}
        <br />
        Data: {data ? jsonToString(data) : null}
      </div>
      <input type="text" value={input} name="note" onChange={onInputChange} />
      <button onClick={call}>Add Note</button>
    </div>
  )
}

export default AddNote
