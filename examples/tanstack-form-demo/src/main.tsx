import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { TanStackDevtools } from "@tanstack/react-devtools"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <TanStackDevtools />
  </StrictMode>
)
