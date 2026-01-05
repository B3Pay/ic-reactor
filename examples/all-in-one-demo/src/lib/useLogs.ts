import { useState, useCallback } from "react"
import type { FrontendLog } from "../lib/types"

/**
 * Custom hook to manage frontend logs.
 * Provides a function to add new logs and maintains a history of the last 50 logs.
 */
export function useLogs() {
  const [frontendLogs, setFrontendLogs] = useState<FrontendLog[]>([])

  const addLog = useCallback((type: FrontendLog["type"], message: string) => {
    const newLog: FrontendLog = {
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString(),
      type,
      message,
    }
    setFrontendLogs((prev) => [newLog, ...prev].slice(0, 50))
  }, [])

  return { frontendLogs, addLog }
}
