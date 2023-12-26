import { AppProps } from "next/app"
import "styles/global.css"

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  return (
    <div>
      <Component {...pageProps} />
    </div>
  )
}

export default App
