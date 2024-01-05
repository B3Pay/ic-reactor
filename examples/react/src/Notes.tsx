import { useQueryCall } from "store"

interface NoteProps {
  publicKey: Uint8Array
}

const Notes: React.FC<NoteProps> = ({ publicKey }) => {
  const { call, data, loading, error } = useQueryCall({
    functionName: "user_simple_notes",
    args: [publicKey],
    autoRefresh: true,
    disableInitialCall: false,
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
      <button onClick={() => call()}>Get Notes</button>
    </div>
  )
}

export default Notes
