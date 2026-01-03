# 🎯 IC-Reactor v3 Demo Cheatsheet

> Quick reference while presenting. Keep this open on a second screen!

---

## ⏱️ Section Timing

| Section             | Est. Time  | Key Files                        |
| ------------------- | ---------- | -------------------------------- |
| **Opening**         | 1-2 min    | —                                |
| **Setup Overview**  | 2-3 min    | `reactor.ts`                     |
| **Auth & State**    | 2-3 min    | `AgentStatus.tsx`                |
| **Suspense**        | 2-3 min    | `SuspenseSection.tsx`            |
| **Analytics**       | 2-3 min    | `AnalyticsSection.tsx`           |
| **Optimistic ❤️**   | 4-5 min    | `GlobalHeart.tsx`, `useHeart.ts` |
| **Infinite Scroll** | 2-3 min    | `PostSection.tsx`                |
| **Logs**            | 1-2 min    | `LogConsole.tsx`                 |
| **Closing**         | 1-2 min    | —                                |
| **Total**           | ~15-20 min |                                  |

---

## 🎬 Demo Flow

```
1. SETUP          → Show reactor.ts (typed factories)
       ↓
2. AUTH           → Login with II, show principal change
       ↓
3. SUSPENSE       → Click "Reset & Suspend", show skeletons
       ↓
4. ANALYTICS      → Point to polling, live dot
       ↓
5. HEART ❤️       → Click once, show optimistic log
       ↓
6. DEBOUNCE       → Click rapidly, show "Updates Prevented"
       ↓
7. CHAOS MODE     → Enable chaos, click heart, show rollback!
       ↓
8. POSTS          → Add 10 posts, scroll for infinite load
       ↓
9. CLOSE          → Recap features, Q&A
```

---

## 🔑 Key APIs to Mention

```typescript
// Factory Functions
createQuery(reactor, { functionName: "..." })
createMutation(reactor, { functionName: "..." })
createSuspenseQuery(reactor, { functionName: "..." })
createInfiniteQuery(reactor, { ... })

// Auth Hooks
useAuth()       → { login, logout, principal, isAuthenticated }
useAgentState() → { isInitialized, isInitializing, error }

// Mutation Callbacks (NEW in v3!)
onSuccess: () => ...        // Called on { ok } result
onCanisterError: (err) => ... // Called on { err } result (business logic)
onError: (err) => ...       // Called on ALL errors (network + canister)

// Query Options
refetchInterval: 3000  // Auto-poll
select: (data) => ...  // Transform data
```

---

## ⚡ Optimistic Update Flow

```
User clicks → addOptimisticLike() → UI updates instantly
      ↓
   Wait 500ms (debounce)
      ↓
   Still latest action? → Send to canister
      ↓
   { ok }: Keep state ✅ | { err }: Rollback ❌ (via onCanisterError)
```

---

## 🎯 Key Takeaways (For Closing)

1. **Type-safe** - Candid → TypeScript, zero manual types
2. **Caching** - TanStack Query handles it all
3. **Suspense** - React 18 patterns work natively
4. **Polling** - One config option: `refetchInterval`
5. **Optimistic** - Instant UI + automatic rollback
6. **onCanisterError** - Dedicated handler for business logic errors!
7. **Infinite** - Built-in pagination support
8. **DevTools** - React Query DevTools included

---

## 🆘 If Something Goes Wrong

| Problem             | Quick Fix                                                 |
| ------------------- | --------------------------------------------------------- |
| II popup blocked    | "Let me allow popups..."                                  |
| Canister error      | "Backend might need redeployment. Let's continue with..." |
| No data             | "The replica might need a restart. The concept is..."     |
| Chaos won't disable | Refresh the page                                          |

---

## 💬 Good Quotes to Use

> "The UI is lying to the user... in a good way!"
> (Explaining optimistic updates)

> "This is TanStack Query doing all the heavy lifting"
> (Showing infinite scroll)

> "Zero boilerplate, full type safety"
> (Showing factory functions)

> "The canister is the source of truth, but the UI shows user intent"
> (Comparing frontend vs backend logs)

---

_Good luck with your demo! 🚀_
