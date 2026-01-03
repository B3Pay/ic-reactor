import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { queryClient } from "./reactor"
import App from "./App"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <ReactQueryDevtools client={queryClient} buttonPosition="bottom-right" />
  </StrictMode>
)
