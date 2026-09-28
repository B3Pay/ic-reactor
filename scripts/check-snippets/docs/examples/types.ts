// `./types` of the all-in-one demo: a log entry of its Frontend Log Console.
export interface FrontendLog {
  id: string
  time: string
  type: "optimistic" | "success" | "error"
  message: string
}
