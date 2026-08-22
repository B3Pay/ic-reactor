const { existsSync } = require("fs")
const { join, resolve } = require("path")

// Adjust the path to load env from ../.env file
const envList = require("dotenv").config({ path: "./.env" }).parsed || {}

// Adjust the path to get version from package.json
const { version } = require("./package.json")

envList.NEXT_PUBLIC_VERSION = version

/**
 * `.env` is written by `dfx deploy` and is gitignored, so a fresh clone has no
 * canister ids and the static export dies with "canisterId is required for
 * todo". Falling back to the management canister id keeps `next build` working
 * for anyone who just wants to compile the template (and for CI, which never
 * runs dfx). The warning is there because a bundle built this way talks to the
 * wrong canister at runtime -- deploy for real only after `dfx deploy` has
 * regenerated `.env`.
 */
if (!envList.CANISTER_ID_TODO) {
  envList.CANISTER_ID_TODO = "aaaaa-aa"
  envList.DFX_NETWORK = envList.DFX_NETWORK || "local"
  console.warn(
    "[ic-reactor] No .env found -- building with a placeholder todo canister id. " +
      "Run `dfx deploy` before building anything you intend to ship."
  )
}

/**
 * Turbopack refuses to compile anything outside its workspace `root`, and under
 * pnpm every dependency in this example's `node_modules` is a symlink into the
 * monorepo's `node_modules/.pnpm` store. Rooting at `__dirname` puts `next`
 * itself out of bounds, and the build dies with "Could not find the Next.js
 * package (next/package.json)" — so inside the monorepo the root has to be the
 * repo, not this directory.
 *
 * This template is also published standalone (StackBlitz/CodeSandbox clone it
 * on its own), where `../..` is an unrelated directory. There the check fails
 * and `root` is left unset, which lets Turbopack infer it from the lockfile.
 */
const monorepoRoot = existsSync(join(__dirname, "../../pnpm-workspace.yaml"))
  ? resolve(__dirname, "../..")
  : undefined

/**
 * `@dfinity/*` is not installed here — the generated `src/declarations` files
 * still import it, so every bundler needs it pointed at the `@icp-sdk/core`
 * subpath that replaced it. Aliasing to the bare specifier (rather than a
 * relative path into `node_modules`) lets each bundler resolve it through the
 * package's own `exports` map, which is what picks the ESM build.
 */
const icpSdkAliases = {
  "@dfinity/agent": "@icp-sdk/core/agent",
  "@dfinity/candid": "@icp-sdk/core/candid",
  "@dfinity/principal": "@icp-sdk/core/principal",
  "@dfinity/identity": "@icp-sdk/core/identity"
}

/** @type {import('next').NextConfig} */
module.exports = {
  output: "export",
  env: envList,

  images: {
    unoptimized: true
  },
  // Transpile IC Reactor packages
  transpilePackages: [
    "@ic-reactor/react",
    "@ic-reactor/core",
    "@icp-sdk/core/agent",
    "@icp-sdk/core/auth",
    "@icp-sdk/core/candid",
    "@icp-sdk/core/principal",
    "@icp-sdk/core/identity",
    "@dfinity/agent",
    "@dfinity/candid",
    "@dfinity/identity",
    "@dfinity/principal"
  ],

  // Turbopack configuration (Next.js 16+ default bundler)
  turbopack: {
    ...(monorepoRoot ? { root: monorepoRoot } : {}),
    resolveAlias: icpSdkAliases
  },

  // Webpack configuration (for `next build --webpack`)
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...icpSdkAliases
    }

    // Fix for ESM directory imports
    config.resolve.extensionAlias = {
      ".js": [".js", ".ts", ".tsx"]
    }

    // Fix for packages that need node polyfills
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: false,
        crypto: false,
        stream: false
      }
    }
    return config
  },
  staticPageGenerationTimeout: 100
}
