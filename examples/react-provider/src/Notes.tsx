import { useNoteQueryCall } from "NoteActor"

interface NoteProps {
  publicKey: Uint8Array
}

const Notes: React.FC<NoteProps> = ({ publicKey }) => {
  const { call, data, loading, error } = useNoteQueryCall({
    functionName: "user_simple_notes",
    args: [publicKey],
    // refetchInterval: 10000,
    refetchOnMount: true,
    onLoading: () => console.log("Loading..."),
    onSuccess: (data) => console.log("Success!", data),
    onError: (error) => console.log("Error!", error),
  })

  return (
    <div>
      <h2>Notes:</h2>
      <div>
        Loading: {loading.toString()}
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
      <button onClick={call}>Get Notes</button>
    </div>
  )
}

export default Notes
