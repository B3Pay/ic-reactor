/**
 * Interface representing a log entry displayed in the Frontend Log Console.
 */
export interface FrontendLog {
  id: string
  time: string
  type: "optimistic" | "success" | "error"
  message: string
}
