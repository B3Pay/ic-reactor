import { useRef, useEffect, useMemo } from "react"
import {
  batchCreatePosts,
  getPosts,
  getPostsCount,
  useUserPrincipal,
} from "../reactor"
import type { FrontendLog } from "../types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PlusCircle, Loader2, User } from "lucide-react"

interface PostSectionProps {
  addLog: (type: FrontendLog["type"], message: string) => void
}

export function PostSection({ addLog }: PostSectionProps) {
  const principal = useUserPrincipal()
  const { data: totalPosts = 0n, refetch: refetchCount } =
    getPostsCount.useQuery()

  const {
    data: rawPosts = [],
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = getPosts.useInfiniteQuery({
    select: (data) => data.pages.flat(),
  })

  // Deduplicate posts
  const posts = useMemo(() => {
    const seen = new Set()
    return rawPosts.filter((p) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })
  }, [rawPosts])

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { mutate: batchCreate, isPending: isCreating } =
    batchCreatePosts.useMutation({
      onSuccess: (ids) => {
        addLog("success", `Batch created ${ids.length} posts`)
        refetchCount()
      },
      onError: (err) => {
        addLog("error", `Failed to batch create: ${err.message}`)
      },
      refetchQueries: [getPosts.getQueryKey()],
    })

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.1,
      }
    )

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleCreatePost = () => {
    if (!principal) return addLog("error", "Please login first")

    // Generate 10 posts
    const batch = Array.from(
      { length: 10 },
      (_, i) =>
        `Check out this auto-refetching list! ${new Date().toLocaleTimeString()} - Batch #${i + 1}`
    )

    batchCreate([batch])
  }

  return (
    <Card className="glass mt-10 border-t-2 border-t-primary/20">
      <CardContent className="p-0">
        <div className="p-4 border-b border-border/40 flex justify-between items-center bg-card/30">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-background/50">
              {totalPosts.toString()} Posts
            </Badge>
          </div>
          <Button
            onClick={handleCreatePost}
            disabled={isCreating}
            size="sm"
            className="gap-2 font-semibold"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            {isCreating ? "Creating..." : "Add 10 Posts"}
          </Button>
        </div>

        <div
          ref={scrollContainerRef}
          className="h-[450px] overflow-y-auto p-4 space-y-3 scroll-smooth"
        >
          {posts.length === 0 && isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin opacity-50" />
              <p>Loading posts...</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p>No posts yet. Be the first!</p>
            </div>
          ) : (
            <>
              {posts.map((post) => (
                <div
                  key={post.id.toString()}
                  className="bg-card/40 hover:bg-card/60 border border-border/20 rounded-xl p-4 transition-all duration-200 hover:translate-x-1 animate-slide-up hover:shadow-md group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="bg-primary/10 p-1 rounded-full text-primary">
                        <User className="w-3 h-3" />
                      </div>
                      <span className="font-mono opacity-70 group-hover:opacity-100 transition-opacity">
                        {post.caller.slice(0, 10)}...
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground/60 bg-muted/30 px-2 py-1 rounded-md">
                      {new Date(
                        Number(post.timestamp) / 1000000
                      ).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 pl-1 border-l-2 border-primary/20 group-hover:border-primary/60 transition-colors pl-3">
                    {post.content}
                  </p>
                </div>
              ))}

              <div
                ref={sentinelRef}
                className="py-6 text-center text-sm text-muted-foreground flex justify-center"
              >
                {isFetchingNextPage ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading more...
                  </span>
                ) : hasNextPage ? (
                  "Scroll for more"
                ) : (
                  "No more posts"
                )}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
