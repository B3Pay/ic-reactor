import { Suspense } from "react"
import { getLikesSuspense, getPostsCountSuspense } from "../lib/factories"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { queryClient } from "@/lib/client"

function NumberSkeleton() {
  return <Skeleton className="h-9 w-16 bg-muted/50" />
}

function StatCard({
  label,
  children,
  icon,
}: {
  label: string
  children: React.ReactNode
  icon?: string
}) {
  return (
    <div className="bg-background/60 p-5 rounded-xl border border-border/40">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-base opacity-60">{icon}</span>}
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-3xl font-extrabold tracking-tight min-h-[36px] flex items-center">
        {children}
      </div>
    </div>
  )
}

function TotalPosts() {
  const { data: count } = getPostsCountSuspense.useSuspenseQuery()
  return <span className="text-gradient">{count.toString()}</span>
}

function TotalLikes() {
  const { data: likes } = getLikesSuspense.useSuspenseQuery()
  return <span className="text-gradient-warm">{likes.length.toString()}</span>
}

export function SuspenseSection() {
  const handleReload = () => {
    // Resetting queries clears the cache, forcing useSuspenseQuery to re-suspend
    queryClient.resetQueries({ queryKey: getPostsCountSuspense.getQueryKey() })
    queryClient.resetQueries({ queryKey: getLikesSuspense.getQueryKey() })
  }

  return (
    <Card className="glass-strong overflow-hidden">
      <CardContent className="pt-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Total Posts" icon="📝">
            <Suspense fallback={<NumberSkeleton />}>
              <TotalPosts />
            </Suspense>
          </StatCard>
          <StatCard label="Total Likes" icon="❤️">
            <Suspense fallback={<NumberSkeleton />}>
              <TotalLikes />
            </Suspense>
          </StatCard>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
            Rendered with <code className="text-[10px]">useSuspenseQuery</code>.
            React automatically handles the loading state for each value
            independently.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReload}
            className="shrink-0 gap-2"
          >
            <span className="text-sm">↻</span>
            Reset & Suspend
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
