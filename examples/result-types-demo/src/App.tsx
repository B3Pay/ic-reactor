import { IDL, Principal, ResultFieldVisitor } from "@ic-reactor/candid"
import { ResultRenderer } from "./components/ResultRenderer"

// Define a test IDL
const testIDL = ({ IDL }: { IDL: any }) => {
  const User = IDL.Record({
    name: IDL.Text,
    age: IDL.Nat,
    is_active: IDL.Bool,
    tags: IDL.Vec(IDL.Text),
    role: IDL.Variant({
      Admin: IDL.Null,
      User: IDL.Null,
      Guest: IDL.Null,
    }),
    identity: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Principal)),
  })

  return IDL.Service({
    get_user: IDL.Func([], [User], ["query"]),
    get_version: IDL.Func([], [IDL.Nat], ["query"]),
  })
}

function App() {
  // Initialize visitor
  const visitor = new ResultFieldVisitor()
  const serviceClass = testIDL({ IDL })
  const serviceMeta = visitor.visitService(serviceClass)

  // Mock data matching the IDL
  const mockUser = {
    name: "Alice",
    age: BigInt(30),
    is_active: true,
    tags: ["react", "candid", "icp"],
    role: { Admin: null },
    identity: [
      ["Alice", Principal.fromText("aaaaa-aa")],
      ["Bob", Principal.fromText("uxrrr-q7777-77774-qaaaq-cai")],
    ],
  }

  // Get metadata for 'get_user'
  const getUserMeta = serviceMeta["get_user"]

  // Generate resolved metadata with values
  // We pass the raw value, and it returns the structure with display values
  const resolved = getUserMeta.generateMetadata(mockUser)
  const userResult = resolved.results[0]

  return (
    <div
      style={{
        padding: "40px",
        fontFamily: "sans-serif",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ borderBottom: "2px solid #333", paddingBottom: "10px" }}>
        Result Types Demo
      </h1>
      <p style={{ fontSize: "1.2em" }}>
        This demo renders purely based on the <code>ResultFieldEnumValue</code>{" "}
        structure produced by <code>ResultFieldVisitor</code>. Each component is
        strictly typed.
      </p>

      <div style={{ marginTop: "30px" }}>
        <h2>Dynamic Record Rendering</h2>
        {resolved.results.map((result) => (
          <ResultRenderer key={result.field.label} result={result} />
        ))}
      </div>

      <div style={{ marginTop: "40px" }}>
        <h2>Underlying Data Structure</h2>
        <p>
          The code below shows the resolved structure (ResultFieldWithValue)
          that drives the UI above.
        </p>
        <pre
          style={{
            background: "#f4f4f4",
            padding: "15px",
            borderRadius: "8px",
            overflowX: "auto",
            fontSize: "12px",
            border: "1px solid #ddd",
          }}
        >
          {JSON.stringify(
            userResult,
            (_, value) =>
              typeof value === "bigint" ? `${value.toString()}n` : value,
            2
          )}
        </pre>
      </div>
    </div>
  )
}

export default App
