import { useRef, useEffect, useMemo, useState } from "react"
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
import {
  PlusCircle,
  Loader2,
  User,
  Check,
  Eye,
  Maximize2,
  Minimize2,
} from "lucide-react"

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

  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  const [isFullScreen, setIsFullScreen] = useState(false)
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

  // Track seen posts
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-post-id")
            if (id) {
              setSeenIds((prev) => {
                if (prev.has(id)) return prev
                const next = new Set(prev)
                next.add(id)
                return next
              })
            }
          }
        })
      },
      {
        root: container,
        threshold: 0.5,
      }
    )

    const elements = container.querySelectorAll("[data-post-id]")
    elements.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [posts])

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

  // Handle Full Screen body scroll lock
  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isFullScreen])

  const handleCreatePost = () => {
    if (!principal) return addLog("error", "Please login first")

    batchCreate(["10"])
  }

  return (
    <Card
      className={`transition-all duration-300 ease-in-out border-primary/20 ${
        isFullScreen
          ? "fixed inset-0 z-50 rounded-none border-0 bg-background/95 backdrop-blur-xl"
          : "glass mt-10 border-t-2"
      }`}
    >
      <CardContent className={`p-0 flex flex-col h-full`}>
        <div className="p-4 border-b border-border/40 flex justify-between items-center bg-card/30 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-background/50 gap-1">
              {totalPosts.toString()} Posts
            </Badge>
            {seenIds.size > 0 && (
              <Badge
                variant="secondary"
                className="bg-primary/10 text-primary gap-1"
              >
                <Eye className="w-3 h-3" />
                {seenIds.size} Seen
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-background/50"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
            >
              {isFullScreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className={`${
            isFullScreen ? "flex-1 pb-10" : "h-[450px]"
          } overflow-y-auto p-4 space-y-3 scroll-smooth`}
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
              {posts.map((post) => {
                const isSeen = seenIds.has(post.id.toString())
                return (
                  <div
                    key={post.id.toString()}
                    data-post-id={post.id.toString()}
                    className={`bg-card/40 border rounded-xl p-4 transition-all duration-300 hover:shadow-md group relative overflow-hidden ${
                      isSeen
                        ? "border-border/20 opacity-80" // Seen style
                        : "border-primary/40 bg-card/60 shadow-sm translate-x-1" // Unseen style
                    } ${isFullScreen ? "max-w-3xl mx-auto" : ""}`}
                  >
                    {isSeen && (
                      <div className="absolute top-2 right-2 text-primary/30 pointer-events-none transition-opacity duration-500">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-2 relative z-10">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div
                          className={`p-1 rounded-full ${
                            isSeen
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
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
                    <p
                      className={`text-sm pl-3 border-l-2 transition-colors relative z-10 ${
                        isSeen
                          ? "text-foreground/70 border-border"
                          : "text-foreground border-primary/60 font-medium"
                      }`}
                    >
                      {post.content}
                    </p>
                  </div>
                )
              })}

              <div
                ref={sentinelRef}
                className="py-6 text-center text-sm text-muted-foreground flex justify-center w-full"
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
