import { Suspense, Fragment } from "react"
import { getPostsQuery, useAuth, useAgentState } from "./store"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

// Category Section Component
const CategoryFeed = ({ category }: { category: string }) => {
  // Create a specialized query for this category
  // This uses the factory we defined in store.ts
  const postsQuery = getPostsQuery(
    (cursor) => [
      // If category is "All", pass [] (None), else pass [category] (Some)
      category === "All" ? [] : [category],
      cursor,
      10n,
    ],
    { queryKey: [category] }
  )

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    postsQuery.useInfiniteQuery()

  return (
    <div className="category-section">
      <div className="category-header">
        <h2>{category} Posts</h2>
        <button
          onClick={() => fetchNextPage()}
          disabled={!hasNextPage || isFetchingNextPage}
          className="load-more-sml"
        >
          {isFetchingNextPage ? "..." : hasNextPage ? "+" : "End"}
        </button>
      </div>

      <div className="posts-row">
        {data.pages.map((page, i) => (
          <Fragment key={i}>
            {page.posts.map((post) => (
              <div key={post.id.toString()} className="post-card-mini">
                <h4>{post.title}</h4>
                <div className="post-meta">{post.category}</div>
                <p>{post.content.substring(0, 100)}...</p>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// Main App Component with Suspense Boundary
function App() {
  // Initialize agent (fetches root key for local development)
  useAuth()
  const { isInitialized, isInitializing, error } = useAgentState()
  const categories = ["Tech", "Lifestyle", "Education"]

  // Wait for agent to be initialized before rendering queries
  if (!isInitialized) {
    return (
      <div className="app-container">
        <h1>Infinite Categories Demo</h1>
        <div className="loading">
          {isInitializing
            ? "Initializing agent..."
            : error
              ? `Error: ${error.message}`
              : "Starting..."}
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <h1>Infinite Categories Demo</h1>

      <Suspense fallback={<div className="loading">Loading All Posts...</div>}>
        <CategoryFeed category="All" />
      </Suspense>

      {categories.map((cat) => (
        <Suspense
          key={cat}
          fallback={<div className="loading">Loading {cat}...</div>}
        >
          <CategoryFeed category={cat} />
        </Suspense>
      ))}

      <ReactQueryDevtools initialIsOpen={false} />
    </div>
  )
}

export default App
