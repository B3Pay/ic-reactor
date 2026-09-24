import { AppProps } from "next/app"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { ICReactorProvider } from "service/provider"

import "styles/global.css"

/**
 * Everything that touches the reactor lives below the provider, so the hooks
 * resolve against this tree's managers rather than a module-scope singleton
 * shared by every server-rendered request.
 *
 * Nothing waits for `clientManager.initialize()` before rendering: on a local
 * replica the agent fetches the root key before its first request, and
 * `useAuth()` initializes the agent when it restores the session. So the
 * pages render on the server too, and the static export carries their HTML.
 */
const App: React.FC<AppProps> = ({ Component, pageProps }) => (
  <ICReactorProvider>
    <Component {...pageProps} />
    <ReactQueryDevtools initialIsOpen={false} position="bottom" />
  </ICReactorProvider>
)

export default App
