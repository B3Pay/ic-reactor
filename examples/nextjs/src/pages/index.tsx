import Head from "next/head"
import Image from "next/image"

import AddTodo from "components/AddTodo"
import Login from "components/Login"
import Todos from "components/Todos"

function HomePage() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <Head>
        <title>IC Todo App | Internet Computer</title>
        <meta
          name="description"
          content="A beautiful Todo application built on the Internet Computer blockchain"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-linear-to-br from-indigo-500/20 to-purple-500/20 rounded-full blur-[100px] animate-pulse" />
        <div
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-linear-to-br from-cyan-500/20 to-indigo-500/20 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-linear-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-[120px]" />
      </div>

      {/* Main content */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 py-12">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-linear-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <svg
                className="w-7 h-7 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-linear-to-r from-white via-indigo-200 to-purple-200 bg-clip-text text-transparent mb-3">
            IC Todo App
          </h1>
          <p className="text-slate-400 text-lg max-w-md mx-auto">
            A decentralized task manager powered by the Internet Computer
          </p>
        </header>

        {/* Login Section */}
        <div className="w-full max-w-lg mb-8">
          <Login />
        </div>

        {/* Todo App Container */}
        <div className="w-full max-w-2xl">
          <div className="bg-linear-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl shadow-black/20 overflow-hidden">
            {/* Add Todo Section */}
            <div className="p-6 border-b border-slate-700/50">
              <AddTodo />
            </div>

            {/* Todos List */}
            <div className="p-6">
              <Todos />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-8 mt-12">
        <div className="flex flex-col items-center gap-4">
          <a
            href="https://internetcomputer.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 px-6 py-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-full border border-slate-700/50 hover:border-slate-600/50 transition-all duration-300"
          >
            <span className="text-slate-400 group-hover:text-slate-300 transition-colors text-sm">
              Powered by
            </span>
            <Image
              width={120}
              height={24}
              src="/icp-logo.svg"
              alt="Internet Computer"
              className="opacity-80 group-hover:opacity-100 transition-opacity"
            />
          </a>
          <p className="text-slate-500 text-sm">
            Built with{" "}
            <a
              href="https://github.com/b3hr4d/ic-reactor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              IC-Reactor
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}

export default HomePage
