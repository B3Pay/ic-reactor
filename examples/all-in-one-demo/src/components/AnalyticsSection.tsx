import { useMemo } from "react"
import { getLogs } from "../lib/factories"
import { Card, CardContent } from "@/components/ui/card"
import { BarChart3, MessageSquare, Users, Activity } from "lucide-react"

export function AnalyticsSection() {
  const { data: logs = [] } = getLogs.useQuery()

  const stats = useMemo(() => {
    const totalEvents = logs.length
    const likes = logs.filter((l) => l.action.includes("add_like")).length
    const posts = logs.filter((l) => l.action.includes("create_post")).length
    const uniqueUsers = new Set(logs.map((l) => l.caller)).size

    // Calculate events in last minute
    const now = Date.now()
    const oneMinuteAgo = now - 60 * 1000
    // Logs timestamp is nanoseconds
    const recentActivity = logs.filter(
      (l) => Number(l.timestamp) / 1000000 > oneMinuteAgo
    ).length

    return { totalEvents, likes, posts, uniqueUsers, recentActivity }
  }, [logs])

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
      <StatCard
        label="Total Interactions"
        value={stats.totalEvents}
        icon={BarChart3}
        color="text-primary"
        className="col-span-2 md:col-span-2 lg:col-span-1"
      />
      <StatCard
        label="Posts Created"
        value={stats.posts}
        icon={MessageSquare}
        color="text-blue-500"
      />
      <StatCard
        label="Unique Users"
        value={stats.uniqueUsers}
        icon={Users}
        color="text-emerald-500"
      />
      <StatCard
        label="Events (1m)"
        value={stats.recentActivity}
        icon={Activity}
        color="text-amber-500"
        isLive
        className="col-span-2 md:col-span-4 lg:col-span-1"
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  isLive,
  className = "",
}: {
  label: string
  value: number | string
  icon: React.ElementType
  color: string
  isLive?: boolean
  className?: string
}) {
  return (
    <Card
      className={`overflow-hidden border-border/40 bg-card/50 card-hover ${className}`}
    >
      <CardContent className="p-5 flex flex-col justify-between h-full min-h-[110px]">
        <div className="flex justify-between items-start">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </h4>
          {isLive && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-2 mt-4">
          <span className="text-3xl font-black tracking-tighter tabular-nums">
            {value}
          </span>
          <Icon className={`w-6 h-6 ${color} opacity-80 mb-1`} />
        </div>
      </CardContent>
    </Card>
  )
}
