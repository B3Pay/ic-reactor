import React from "react"
import { ICReactorProvider } from "./providers"
import { TodoReactorProvider } from "./todo-provider"
import AuthSection from "./AuthSection"
import TodoList from "./TodoList"

export default function Home() {
  return (
    <ICReactorProvider>
      <TodoReactorProvider>
        <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl mx-auto text-center mb-8">
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
              IC Reactor
            </h1>
            <p className="mt-3 text-lg text-gray-500">
              Next.js 14 App Router + Server Side Hydration Safety Pattern
            </p>
          </div>

          <AuthSection />
          <TodoList />

          <div className="max-w-xl mx-auto mt-8 text-center text-xs text-gray-400">
            <p>
              This example exhibits the clean architecture required when
              instantiating raw actors statefully in hydration-safe trees.
            </p>
          </div>
        </main>
      </TodoReactorProvider>
    </ICReactorProvider>
  )
}
