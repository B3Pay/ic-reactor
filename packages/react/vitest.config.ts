import { defineConfig } from "vitest/config"

/**
 * IC Reactor supports `@icp-sdk/auth` v8 and v10, which sign in over different
 * protocols, so the suite that drives the real AuthClient runs against each.
 * The `react` project resolves the v10 devDependency. `auth-v8` reruns that
 * suite with `@icp-sdk/auth` aliased to `@icp-sdk/auth-v8`, an npm alias of v8.
 */
const REAL_AUTH_CLIENT_TESTS = [
  "tests/auth/internet-identity-integration.test.ts",
  "tests/auth/auth-client-lifecycle.test.ts",
]

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test-setup.ts"],
    exclude: ["dist", "node_modules"],
    projects: [
      { extends: true, test: { name: "react" } },
      {
        extends: true,
        test: { name: "auth-v8", include: REAL_AUTH_CLIENT_TESTS },
        resolve: {
          alias: [
            // Matches `@icp-sdk/auth` and its subpaths, not `@icp-sdk/auth-v8`.
            {
              find: /^@icp-sdk\/auth(?=\/|$)/,
              replacement: "@icp-sdk/auth-v8",
            },
          ],
        },
      },
    ],
  },
})
