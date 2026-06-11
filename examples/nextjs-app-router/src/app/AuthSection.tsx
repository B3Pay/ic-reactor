"use client"

import React from "react"
import { useICAuth } from "./providers"
import { createAuthHooks } from "@ic-reactor/auth-react"

export default function AuthSection() {
  const { authentication } = useICAuth()
  const { useAuth, useUserPrincipal } = createAuthHooks(authentication)

  const { login, logout, isAuthenticated, isAuthenticating } = useAuth()
  const principal = useUserPrincipal()

  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-xl mx-auto mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-md">🛡️</div>
          <div>
            <h3 className="font-semibold text-gray-800">Internet Identity</h3>
            <p className="text-xs text-gray-500">
              {isAuthenticated
                ? "Signed in with Identity Anchor"
                : "Protected Canister Operations"}
            </p>
          </div>
        </div>

        {isAuthenticated ? (
          <button
            onClick={() => logout()}
            className="flex items-center gap-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Sign Out
          </button>
        ) : (
          <button
            onClick={() => login()}
            disabled={isAuthenticating}
            className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            {isAuthenticating ? "Connecting..." : "Sign In"}
          </button>
        )}
      </div>

      {principal && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 font-medium mb-1">
            Your Principal ID:
          </p>
          <code className="text-xs bg-gray-50 p-2 block rounded font-mono text-gray-700 truncate select-all">
            {principal.toString()}
          </code>
        </div>
      )}
    </div>
  )
}
