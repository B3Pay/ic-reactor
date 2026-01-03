"use client"
import { QueryClientProvider } from "@tanstack/react-query"
import { AppProps } from "next/app"
import { clientManager, queryClient, useAgentState } from "reactor"
import "styles/global.css"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { useEffect } from "react"

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  const { isInitialized } = useAgentState()

  useEffect(() => {
    clientManager.initialize()
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
