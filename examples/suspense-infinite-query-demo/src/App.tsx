import { Suspense, useEffect, useRef, useState } from "react"
import { getPostsQuery } from "./store"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type { Post } from "./declarations/backend/backend.did"

function fmt(n: bigint) {
  const num = Number(n)
  return num >= 1000 ? `${(num / 1000).toFixed(1)}K` : String(num)
}

// ─── Auto-load sentinel ───────────────────────────────────────────────────────

function AutoLoadSentinel({
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: {
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasNextPage) return
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: "400px" }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  return (
    <div ref={ref} className="sentinel">
      {isFetchingNextPage && (
        <div className="spinner-wrap">
          <div className="spinner" />
        </div>
      )}
      {!hasNextPage && <p className="end-label">You're all caught up ✓</p>}
    </div>
  )
}

// ─── Post card ───────────────────────────────────

function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(false)
  const [reposted, setReposted] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)

  return (
    <article className="post-card">
      {/* Avatar comes from canister */}
      <div className="post-avatar">{post.avatar}</div>

      <div className="post-body">
        {/* Author metadata from canister */}
        <div className="post-header">
          <span className="post-name">{post.author}</span>
          <span className="post-handle">@{post.handle}</span>
          <span className="post-dot">·</span>
          <span className="post-time">{post.timestamp}</span>
        </div>

        {/* Content from canister */}
        <p className="post-title">{post.title}</p>
        <p className="post-content">{post.content}</p>
        <span className="post-tag">#{post.category}</span>

        {/* Engagement counts from canister */}
        <div className="post-actions">
          <button className="action reply">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>{fmt(post.replies)}</span>
          </button>

          <button
            className={`action repost ${reposted ? "on" : ""}`}
            onClick={() => setReposted((r) => !r)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            <span>{fmt(post.reposts + BigInt(reposted ? 1 : 0))}</span>
          </button>

          <button
            className={`action like ${liked ? "on" : ""}`}
            onClick={() => setLiked((l) => !l)}
          >
            <svg
              viewBox="0 0 24 24"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span>{fmt(post.likes + BigInt(liked ? 1 : 0))}</span>
          </button>

          <button className="action views">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{fmt(post.views)}</span>
          </button>

          <button
            className={`action bookmark ${bookmarked ? "on" : ""}`}
            onClick={() => setBookmarked((b) => !b)}
          >
            <svg
              viewBox="0 0 24 24"
              fill={bookmarked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  )
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="feed">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="post-card skeleton-card">
          <div className="sk sk-avatar" />
          <div className="post-body">
            <div className="sk sk-line short" />
            <div className="sk sk-line" />
            <div className="sk sk-line medium" />
            <div className="sk sk-line short" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Category feed ────────────────────────────────────────────────────────────

function CategoryFeed({ category }: { category: string }) {
  const postsQuery = getPostsQuery(
    (cursor) => [category === "All" ? [] : [category], cursor, 10n],
    { queryKey: [category] }
  )

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    postsQuery.useSuspenseInfiniteQuery()

  const allPosts = data.pages.flatMap((p) => p.posts)

  return (
    <div className="feed">
      {allPosts.map((post) => (
        <PostCard key={post.id.toString()} post={post} />
      ))}
      <AutoLoadSentinel
        fetchNextPage={fetchNextPage}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
      />
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "All", label: "For You" },
  { id: "Tech", label: "Tech" },
  { id: "Lifestyle", label: "Lifestyle" },
  { id: "Education", label: "Education" },
]

export default function App() {
  const [activeTab, setActiveTab] = useState("All")

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">◎ IC Feed</span>
      </header>

      <nav className="tab-bar">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className={`tab-btn ${activeTab === id ? "active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="feed-container">
        <Suspense key={activeTab} fallback={<FeedSkeleton />}>
          <CategoryFeed category={activeTab} />
        </Suspense>
      </main>

      <ReactQueryDevtools initialIsOpen={false} />
    </div>
  )
}
