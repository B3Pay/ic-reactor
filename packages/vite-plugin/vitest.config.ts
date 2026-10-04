/// <reference types="vitest" />
import { version } from "vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Vite 4, the oldest major the peer range accepts and which
    // `verify:peer-floors` runs these tests on, binds its WebSocket server to
    // port 24678 in middleware mode even with `hmr: false`, so the servers of
    // two test files at once collide (EADDRINUSE). There the files run one at
    // a time; from Vite 5 on, in parallel.
    fileParallelism: Number(version.split(".")[0]) >= 5,
  },
})
