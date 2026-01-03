# 🎬 IC-Reactor v3 Demo Script

> **For the ICP Community** | Estimated Time: 15-20 minutes
>
> This script walks through the **all-in-one-demo** showcasing the power of `@ic-reactor/react` v3 — bringing modern React patterns to the Internet Computer.

---

## 🎯 Pre-Demo Checklist

1. **Local replica running**: `dfx start --clean --background`
2. **Backend deployed**: `dfx deploy backend`
3. **Dev server running**: `pnpm dev`
4. **Browser**: Have the demo open at `http://localhost:5173`
5. **DevTools**: Open React Query DevTools (bottom right corner)

---

## 📍 Opening (1-2 minutes)

### 🎤 Talking Points

> "Welcome everyone! Today I'm excited to show you **IC-Reactor v3** — a complete rewrite of our React integration library for the Internet Computer.
>
> IC-Reactor v3 is built on **TanStack Query** (formerly React Query), which means you get:
>
> - **Automatic caching & background refetching**
> - **Optimistic updates with automatic rollback**
> - **Suspense support out of the box**
> - **Automatic Result type unwrapping** (unique to ic-reactor!)
> - **In-browser code exploration** (new!)
> - **Full TypeScript inference from your Candid IDL**
>
> Let's dive into the demo!"

---

## 📍 Section 1: Setup Overview (2-3 minutes)

### 🎤 Talking Points

> "In this v3 version, we've also added a **'View Example Code'** button to every section. This lets you see the exact hook or factory definition we're discussing without leaving the browser — perfect for learning the patterns!
>
> Let let me show you how simple the setup is."

### 📂 Show `reactor.ts`

Open the file `src/reactor.ts` and walk through:

```typescript
// 1️⃣ Create a ClientManager - handles agent lifecycle & auth
export const clientManager = new ClientManager({
  queryClient,
  withProcessEnv: true, // Auto-reads DFX environment variables
})

// 2️⃣ Create a Reactor - typed Actor wrapper
export const reactor = new Reactor<_SERVICE>({
  clientManager,
  canisterId,
  idlFactory, // Generated from your Candid file
})

// 3️⃣ Create typed hooks using factory functions
export const getLikes = createQuery(reactor, {
  functionName: "get_likes", // TypeScript knows this returns Principal[]!
  refetchInterval: 3000, // Auto-poll every 3 seconds
})

export const likeHeart = createMutation(reactor, {
  functionName: "like", // TypeScript knows args & return type
})
```

> "**Key takeaway**: You define your queries and mutations once, and get fully typed hooks with zero boilerplate. The `functionName` is type-checked against your Candid interface!"

---

## 📍 Section 2: Authentication & Agent State (2-3 minutes)

### 🖱️ Demo Actions

1. **Point to the "State Management & Auth" section**
2. **Show the current Principal ID** (anonymous: `2vxsx-fae...`)
3. **Click "Login via Internet Identity"**
4. **Complete the II authentication flow**
5. **Show the badge change from "Anonymous" to "Authenticated"**
6. **Point to the Connection State indicators**

### 🎤 Talking Points

> "IC-Reactor v3 gives you **built-in hooks** for authentication. Watch what happens when I log in..."
>
> _[Click login, complete II flow]_
>
> "Notice how:
>
> - The Principal ID updates **instantly**
> - The badge shows **Authenticated** with a pulsing indicator
> - The Connection State shows **Agent Initialized: Ready**
>
> All of this comes from `useAuth()` and `useAgentState()` — no custom state management needed!"

### 📂 Show relevant code

```typescript
// One-liner auth hooks
const { login, logout, principal, isAuthenticated } = useAuth()

// Agent state tracking
const agentState = useAgentState()
// → { isInitialized, isInitializing, error }
```

---

## 📍 Section 3: Suspense Queries (2-3 minutes)

### 🖱️ Demo Actions

1. **Point to the "Suspense Query Demo" section**
2. **Show the Total Posts and Total Likes values**
3. **Click "Reset & Suspend" button**
4. **Watch the skeleton loading states appear briefly**
5. **Both values reappear when ready**

### 🎤 Talking Points

> "React 18 brought us Suspense for data fetching. IC-Reactor v3 supports this natively!
>
> Watch what happens when I reset the queries..."
>
> _[Click Reset & Suspend]_
>
> "See those skeleton placeholders? That's React Suspense in action. Each value suspends **independently** — the UI only shows a fallback for components that are loading.
>
> The magic is in `useSuspenseQuery` — it throws a Promise that React catches!"

### 📂 Show relevant code

```typescript
// Create a suspense query factory
export const getLikesSuspense = createSuspenseQuery(reactor, {
  functionName: "get_likes",
})

// Component usage - data is ALWAYS defined, no loading check needed!
function TotalLikes() {
  const { data: likes } = getLikesSuspense.useSuspenseQuery()
  return <span>{likes.length.toString()}</span>
}

// Wrap with Suspense boundary
<Suspense fallback={<NumberSkeleton />}>
  <TotalLikes />
</Suspense>
```

---

## 📍 Section 4: Real-Time Analytics with Auto-Polling (2-3 minutes)

### 🖱️ Demo Actions

1. **Point to the "Real-Time Canister Analytics" section**
2. **Show the green pulsing dot next to "Events (1m)" indicating live data**
3. **Watch the numbers update in real-time**
4. **Point to the fetching indicator next to the section title**

### 🎤 Talking Points

> "IC-Reactor v3 supports **automatic polling** out of the box.
>
> This analytics section polls the backend every **1 second** to fetch the latest logs. See that pulsing green dot? That means it's live!
>
> All of this is just one config option: `refetchInterval: 1000`"

### 📂 Show relevant code

```typescript
export const getLogs = createQuery(reactor, {
  functionName: "get_logs",
  refetchInterval: 1000,  // Poll every second
})

// In component - data stays fresh automatically
function AnalyticsSection() {
  const { data: logs = [] } = getLogs.useQuery()

  // Client-side aggregation
  const stats = useMemo(() => {
    const likes = logs.filter(l => l.action.includes("add_like")).length
    const posts = logs.filter(l => l.action.includes("create_post")).length
    return { likes, posts, ... }
  }, [logs])
}
```

---

## 📍 Section 5: Optimistic Updates — The Star of the Show (4-5 minutes)

### 🖱️ Demo Actions (Part A: Optimistic Like)

1. **Point to the "Optimistic Global Heart" section**
2. **Draw attention to the Frontend log console on the right**
3. **Click the heart ❤️ button**
4. **Watch:**
   - Like count updates **instantly**
   - Frontend log shows "⚡ Optimistically liking..."
   - Then "Like confirmed by canister" appears
5. **Click rapidly multiple times**
6. **Show "Updates Prevented" badge appearing (debounce in action)**

### 🎤 Talking Points

> "Here's where IC-Reactor v3 really shines — **optimistic updates**.
>
> When I click this heart, the UI updates **immediately**. Watch the frontend log..."
>
> _[Click heart]_
>
> "See? The count went up before the canister confirmed. The blue ⚡ message shows it's optimistic, then green confirms success.
>
> Now watch what happens if I click rapidly..."
>
> _[Click multiple times quickly]_
>
> "See that 'Updates Prevented' badge? That's **smart debouncing** — we don't spam the network. Only the final state gets sent to the canister!"

### 📂 Show relevant code

```typescript
// 🪄 DEDICATED ERROR HANDLERS (Unique to ic-reactor v3!)
// ic-reactor provides THREE callback types:

const { mutateAsync } = likeHeart.useMutation({
  onSuccess: () => {
    // ✅ Called when canister returns { Ok }
    console.log("Like confirmed!")
  },

  onCanisterError: (err) => {
    // 🎯 NEW! Called ONLY for canister { Err } results
    // err.err = typed error value from Candid
    // err.code = variant key (e.g., "InsufficientBalance")
    console.error("Canister rejected:", err.code)
  },

  onError: (err) => {
    // ⚠️ Called for ALL errors (network + canister)
    console.error("Mutation failed:", err)
  },
})

// React 19's useOptimistic hook in action
const [optimisticLikes, addOptimisticLike] = useOptimistic(likes)

startTransition(async () => {
  addOptimisticLike({ type: "add", principal }) // UI instant
  await mutateAsync([]) // Network
  // On { Err } → React AUTOMATICALLY rolls back!
})
```

### 🖱️ Demo Actions (Part B: Chaos Mode!)

1. **Click "Stable Mode" button to activate "Chaos Active"**
2. **Backend log shows "Chaos Mode ACTIVATED"**
3. **The button glows red ominously**
4. **Click the heart again**
5. **Watch:**
   - UI updates optimistically
   - Then ROLLS BACK when canister returns error!
   - Frontend log shows error message

### 🎤 Talking Points

> "Now let's test failure handling. I'm enabling **Chaos Mode**..."
>
> _[Click Stable Mode → Chaos Active]_
>
> "This tells the backend to fail all like/unlike operations. Now watch what happens when I click the heart..."
>
> _[Click heart]_
>
> "The UI updated optimistically... then **rolled back**! The log shows the error. This is the power of optimistic updates — instant feedback, but automatic recovery on failure.
>
> TanStack Query handles all of this for you!"

---

## 📍 Section 6: Infinite Scrolling (2-3 minutes)

### 🖱️ Demo Actions

1. **Point to the "Live Posts Feed" section**
2. **Click "Add 10 Posts" button** (login first if not already)
3. **Watch posts appear with smooth animations**
4. **Scroll down in the posts container**
5. **Watch "Loading more..." appear at the bottom**
6. **New posts load automatically via infinite query**

### 🎤 Talking Points

> "IC-Reactor v3 supports **infinite queries** for paginated data.
>
> Let me add some posts..."
>
> _[Click Add 10 Posts]_
>
> "Beautiful animations! Now watch what happens when I scroll down..."
>
> _[Scroll down]_
>
> "See 'Loading more...'? That's our **Intersection Observer** triggering the next page fetch. The backend uses efficient Motoko slicing with offset/limit pagination.
>
> This is `createInfiniteQuery` doing all the heavy lifting!"

### 📂 Show relevant code

```typescript
export const getPosts = createInfiniteQuery(reactor, {
  functionName: "get_posts",
  initialPageParam: 0n,
  getArgs: (offset) => [offset, 5n] as const, // offset, limit
  getNextPageParam: (lastPage, allPages) => {
    if (lastPage.length < 5) return null // No more pages
    return BigInt(allPages.length) * 5n
  },
})

// Usage
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
  getPosts.useInfiniteQuery({
    select: (data) => data.pages.flat(), // Flatten all pages
  })
```

---

## 📍 Section 7: Activity Logs — Frontend vs Backend (1-2 minutes)

### 🖱️ Demo Actions

1. **Point to the Activity Logs sidebar**
2. **Show Frontend logs (Terminal icon)** — local optimistic states
3. **Show Canister Events (Database icon)** — actual backend logs
4. **Compare the two — Frontend shows intentions, Backend shows confirmed actions**

### 🎤 Talking Points

> "Finally, notice we have two log consoles:
>
> - **Frontend** shows optimistic actions and their outcomes
> - **Canister Events** shows what the backend actually recorded
>
> This split view is perfect for debugging. You can see exactly when optimistic updates happen versus when the canister confirms them.
>
> The backend logs even include the caller's Principal — everything is traceable on-chain!"

---

## 📍 Closing (1-2 minutes)

### 🎤 Talking Points

> "That's IC-Reactor v3! To recap what we covered:
>
> ✅ **Type-safe hooks** generated from your Candid interface  
> ✅ **Built-in authentication** with Internet Identity  
> ✅ **Suspense support** for declarative loading states  
> ✅ **Auto-polling** for real-time data  
> ✅ **Optimistic updates** with automatic rollback on failure  
> ✅ **`onCanisterError` callback** — dedicated handler for business logic errors!  
> ✅ **Infinite queries** for paginated data
>
> All powered by TanStack Query with zero boilerplate.
>
> Check out the documentation at **[docs site]** and the examples on GitHub.
>
> Questions?"

---

## 🛠️ Troubleshooting Tips

| Issue                | Solution                                      |
| -------------------- | --------------------------------------------- |
| "Canister not found" | Run `dfx deploy backend` again                |
| II popup blocked     | Allow popups for localhost                    |
| No data appearing    | Check that replica is running with `dfx ping` |
| Posts not loading    | Ensure you're authenticated first             |

---

## 📚 Key Code Files Referenced

| File                                 | Purpose                    |
| ------------------------------------ | -------------------------- |
| `src/reactor.ts`                     | All hook factories & setup |
| `src/hooks/useHeart.ts`              | Optimistic update logic    |
| `src/components/AgentStatus.tsx`     | Auth UI                    |
| `src/components/SuspenseSection.tsx` | Suspense demo              |
| `src/components/PostSection.tsx`     | Infinite scroll            |
| `src/components/GlobalHeart.tsx`     | Main heart UI              |
| `src/components/ControlPanel.tsx`    | Chaos mode toggle          |

---

## 🎁 Bonus: Quick Feature Comparison

| Feature            | ic-reactor v2     | ic-reactor v3        |
| ------------------ | ----------------- | -------------------- |
| State Management   | Custom Redux-like | TanStack Query       |
| Caching            | Manual            | Automatic            |
| Suspense           | ❌                | ✅                   |
| Infinite Queries   | ❌                | ✅                   |
| Optimistic Updates | Manual            | Built-in             |
| Result Unwrapping  | Manual            | Automatic            |
| Type Inference     | Partial           | Full Candid IDL      |
| DevTools           | None              | React Query DevTools |

---

_Script created for IC-Reactor v3 Demo • January 2026_
