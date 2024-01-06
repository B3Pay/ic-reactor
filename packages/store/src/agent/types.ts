import { HttpAgentOptions } from "@dfinity/agent"

export interface ReActorAgentOptions extends HttpAgentOptions {
  isLocal?: boolean
  withDevtools?: boolean
}
