import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/client"
import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/wallet")({
  component: WalletLayout,
})

function WalletLayout() {
  const { isAuthenticated, login, logout } = useAuth()
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900 p-4 font-sans text-slate-100">
      <div className="flex flex-col items-center w-full space-y-6">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold mb-2 bg-clip-text text-transparent bg-linear-to-r from-blue-400 to-purple-600">
            IC Reactor
          </h1>
          <p className="text-gray-400">TanStack Router Integration Demo</p>
        </div>

        <Card className="w-full max-w-md flex flex-row justify-between items-center p-4">
          <div className="flex flex-col">
            <span className="text-sm text-gray-400">Status</span>
            <span
              className={`font-semibold ${
                isAuthenticated ? "text-green-400" : "text-yellow-400"
              }`}
            >
              {isAuthenticated ? "Authenticated" : "Anonymous"}
            </span>
          </div>
          {isAuthenticated ? (
            <Button variant="destructive" size="sm" onClick={() => logout()}>
              Logout
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                login({
                  identityProvider: "https://id.ai/#authorize",
                })
              }
            >
              Login to II
            </Button>
          )}
        </Card>

        <Outlet />
      </div>
    </div>
  )
}
