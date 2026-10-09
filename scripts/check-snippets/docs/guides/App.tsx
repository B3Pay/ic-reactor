// The Getting started page's `./App`: the module its `src/main.tsx` loads with
// React.lazy, the `App` of step 6, which builds the client with an AuthClient
// and imports the generated module. Its type is step 6's: no props.
import { createClient } from "@ic-reactor/core"
import { ReactorProvider } from "@ic-reactor/react"
import { AuthClient } from "@icp-sdk/auth/client"

export function App() {
  return (
    <ReactorProvider
      client={() =>
        createClient({
          network: "ic",
          auth: (network) => new AuthClient(network),
        })
      }
    >
      <p />
    </ReactorProvider>
  )
}
