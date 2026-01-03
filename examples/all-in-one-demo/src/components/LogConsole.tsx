import { getLogs } from "../reactor"
import { Card, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Terminal, Database } from "lucide-react"

/**
 * Props for the LogConsole component.
 */
interface LogConsoleProps {
  title: string
  logs: any[]
  isFrontend?: boolean
}

export function LogConsole({ title, logs, isFrontend }: LogConsoleProps) {
  const Icon = isFrontend ? Terminal : Database

  return (
    <Card className="p-0 bg-slate-950 border-slate-800 shadow-inner h-[400px] flex flex-col overflow-hidden ring-1 ring-white/5">
      <div className="h-10 flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/50">
        <CardTitle className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
        </CardTitle>
      </div>

      <ScrollArea className="flex-1 p-4 font-mono text-xs">
        <div className="space-y-3">
          {logs.length === 0 && (
            <div className="text-slate-700 italic text-center py-10">
              No logs yet...
            </div>
          )}
          {logs.map((log, i) => (
            <div
              key={i}
              className="flex gap-3 animate-slide-up group"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="text-slate-600 shrink-0 select-none">
                {isFrontend
                  ? log.time
                  : new Date(
                      Number(log.timestamp) / 1000000
                    ).toLocaleTimeString()}
              </span>
              <div className="break-all leading-relaxed">
                {isFrontend ? (
                  <span
                    className={
                      log.type === "optimistic"
                        ? "text-blue-400"
                        : log.type === "error"
                          ? "text-red-400"
                          : "text-emerald-400"
                    }
                  >
                    {log.type === "optimistic" && "⚡ "}
                    {log.message}
                  </span>
                ) : (
                  <span className="text-slate-300">
                    <span className="text-purple-400 opacity-80 mr-2">
                      [{log.caller.slice(0, 5)}...]
                    </span>
                    {log.action}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  )
}

/**
 * specialized component to fetch and display backend logs from the canister.
 */
export function BackendLogConsole() {
  const { data = [] } = getLogs.useQuery({
    select: (d) => [...d].reverse(),
  })
  return <LogConsole title="Canister Events" logs={data} />
}
