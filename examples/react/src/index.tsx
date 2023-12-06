import { createRoot } from "react-dom/client"

import App from "App"
import { ReActorProvider } from "./store"

const root = createRoot(document.getElementById("root")!)

root.render(
  <ReActorProvider>
    <App />
  </ReActorProvider>
)
