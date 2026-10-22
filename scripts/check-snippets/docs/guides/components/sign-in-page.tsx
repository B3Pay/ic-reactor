// The Auth guide's `@/components/sign-in-page`: the same component the guide
// shows as src/components/sign-in-page.tsx. Keep the two in step.
import { useAuth } from "@ic-reactor/react"
import { useEffect, useState } from "react"

/** Signs in each time it loads; Internet Identity's return goes to /account. */
export function SignInPage() {
  const { status, signIn } = useAuth()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (status === "signed-in") return
    const start = setTimeout(() => {
      signIn({ returnTo: "/account" }).catch((error: unknown) => {
        console.error(error)
        setFailed(true)
      })
    })
    return () => clearTimeout(start)
  }, [status, signIn])
  if (status === "signed-in") return <a href="/account">Continue</a>
  if (failed) {
    return (
      <p>
        The sign-in did not finish. <a href="/sign-in">Try again</a>
      </p>
    )
  }
  return <p>Signing you in…</p>
}
