import { AgentProvider } from "@ic-reactor/react"
import { AppProps } from "next/app"
import { useEffect, useState } from "react"
import "styles/global.css"

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  /// This is a workaround for client-side rendering
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted ? (
    <AgentProvider withProcessEnv>
      <Component {...pageProps} />
    </AgentProvider>
  ) : null
}

export default App
