// Third-party modules snippets import that no workspace package installs.
// Only the parts the snippets use are declared.

declare module "@vitejs/plugin-react" {
  import type { PluginOption } from "vite"
  export default function react(options?: object): PluginOption[]
}
