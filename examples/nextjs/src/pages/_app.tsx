import { QueryClientProvider } from "@tanstack/react-query"
import { AppProps } from "next/app"
import { clientManager, queryClient, useAgentState } from "service/client"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

import "styles/global.css"
import { useEffect } from "react"

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  const { isInitialized } = useAgentState()

  useEffect(() => {
    clientManager.initialize().catch(console.error)
  }, [])

  if (!isInitialized) return null

  return (
    <QueryClientProvider client={queryClient}>
      <Component {...pageProps} />
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  )
}

export default App
