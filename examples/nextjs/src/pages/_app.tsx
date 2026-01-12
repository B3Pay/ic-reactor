import { QueryClientProvider } from "@tanstack/react-query"
import { AppProps } from "next/app"
import { queryClient, useAgentState } from "service/client"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

import "styles/global.css"

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  const { isInitialized } = useAgentState()

  if (!isInitialized) return null

  return (
    <QueryClientProvider client={queryClient}>
      <Component {...pageProps} />
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  )
}

export default App
