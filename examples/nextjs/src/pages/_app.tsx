import { AppProps } from "next/app"
import { useEffect } from "react"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import {
  ICReactorProvider,
  useAgentState,
  useClientManager
} from "service/provider"

import "styles/global.css"

/**
 * Everything that touches the reactor lives below the provider, so the hooks
 * resolve against this tree's managers rather than a module-scope singleton
 * shared by every server-rendered request.
 */
const AppShell: React.FC<AppProps> = ({ Component, pageProps }) => {
  const clientManager = useClientManager()
  const { isInitialized } = useAgentState()

  useEffect(() => {
    clientManager.initialize().catch(console.error)
  }, [clientManager])

  if (!isInitialized) return null

  return (
    <>
      <Component {...pageProps} />
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </>
  )
}

const App: React.FC<AppProps> = props => (
  <ICReactorProvider>
    <AppShell {...props} />
  </ICReactorProvider>
)

export default App
