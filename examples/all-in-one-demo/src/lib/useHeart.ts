import React, { useOptimistic, useTransition } from "react"
import {
  likeHeart,
  unlikeHeart,
  getLikes,
  useUserPrincipal,
} from "../lib/reactor"
import type { FrontendLog } from "../lib/types"

/**
 * Custom hook to handle the Global Heart logic.
 * Encapsulates optimistic updates, debouncing, and server synchronization.
 */
export function useHeart(
  addLog: (type: FrontendLog["type"], message: string) => void
) {
  const principal = useUserPrincipal()

  // Fetch real data from the canister
  const { data: likes = [], isLoading: isLikesLoading } = getLikes.useQuery()

  // Optimistic State Management
  // Immediately reflects the user's intent before server confirmation
  const [optimisticLikes, addOptimisticLike] = useOptimistic(
    likes,
    (state, newLike: { type: "add" | "remove"; principal: string }) => {
      if (newLike.type === "add") {
        return [...state, newLike.principal]
      } else {
        return state.filter((p) => p !== newLike.principal)
      }
    }
  )

  // Derive 'isLiked' state from the optimistic data
  const isLiked = React.useMemo(() => {
    if (!principal) return false
    return optimisticLikes.some((p) => p === principal.toText())
  }, [optimisticLikes, principal])

  const [, startTransition] = useTransition()

  // Debounce ref to track the latest action ID
  // Used to prevent outdated requests from firing
  const operationIdRef = React.useRef(0)
  const [savedUpdates, setSavedUpdates] = React.useState(0)

  // Mutations
  // 🪄 ic-reactor v3 unique feature: onCanisterError!
  // - onSuccess: called when canister returns { Ok }
  // - onCanisterError: called when canister returns { Err } (business logic errors)
  // - onError: called for ALL errors including network failures
  const { mutateAsync: likeMutate } = likeHeart.useMutation({
    onSuccess: () => {
      addLog("success", "Like confirmed by canister")
    },
    onCanisterError: (err) => {
      addLog("error", `Canister rejected like: ${err.message}`)
    },
    onError: (err) => {
      console.error("Like mutation error:", err)
      // Called for all errors (network, agent failures, etc.)
      // CanisterErrors also trigger this after onCanisterError
    },
    onSettled: () => getLikes.refetch(),
  })

  const { mutateAsync: unlikeMutate } = unlikeHeart.useMutation({
    onSuccess: () => {
      addLog("success", "Unlike confirmed by canister")
    },
    onCanisterError: (err) => {
      addLog("error", `Canister rejected unlike: ${err.message}`)
    },
    onError: (err) => {
      console.error("Unlike mutation error:", err)
    },
    onSettled: () => getLikes.refetch(),
  })

  // The main handler for the heart click
  const handleHeartClick = () => {
    if (!principal) return addLog("error", "Please login first")

    const currentOpId = operationIdRef.current + 1
    operationIdRef.current = currentOpId

    startTransition(async () => {
      const action = isLiked ? "remove" : "add"

      // 1. Apply optimistic update immediately
      addOptimisticLike({ type: action, principal: principal.toText() })

      addLog(
        "optimistic",
        `Optimistically ${action === "add" ? "liking" : "unliking"}...`
      )

      // 2. Debounce Delay (500ms)
      // Wait to see if the user clicks again
      await new Promise((resolve) => setTimeout(resolve, 500))

      // 3. Check if this action is still the latest
      if (operationIdRef.current !== currentOpId) {
        addLog("optimistic", "Action superseded (debounced)")
        setSavedUpdates((prev) => prev + 1)
        return
      }

      // 4. Perform actual network request
      try {
        if (action === "add") {
          await likeMutate([])
        } else {
          await unlikeMutate([])
        }
      } catch (error) {
        // Errors handled in mutation onError callbacks
      }
    })
  }

  return {
    likesCount: optimisticLikes.length,
    isLiked,
    isLikesLoading,
    handleHeartClick,
    savedUpdates,
  }
}
