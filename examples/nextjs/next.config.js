// Adjust the path to load env from ../.env file
const envList = require("dotenv").config({ path: "./.env" }).parsed || {}

// Adjust the path to get version from package.json
const { version } = require("./package.json")

envList.NEXT_PUBLIC_VERSION = version

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
  /*
   * Turbopack configuration
   * Fixes "rule.loaders is not iterable" by using resolveAlias instead of rules for aliasing
   */
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "@dfinity/agent": "./node_modules/@icp-sdk/core/lib/esm/agent",
      "@dfinity/candid": "./node_modules/@icp-sdk/core/lib/esm/candid",
      "@dfinity/principal": "./node_modules/@icp-sdk/core/lib/esm/principal",
      "@dfinity/identity": "./node_modules/@icp-sdk/core/lib/esm/identity"
    }
  },

  // Webpack configuration (for production builds or --webpack flag)
  webpack: (config, { isServer }) => {
    // Add aliases for @dfinity packages to map to @icp-sdk packages
    config.resolve.alias = {
      ...config.resolve.alias,
      "@dfinity/agent": "./node_modules/@icp-sdk/core/agent",
      "@dfinity/candid": "./node_modules/@icp-sdk/core/candid",
      "@dfinity/principal": "./node_modules/@icp-sdk/core/principal",
      "@dfinity/identity": "./node_modules/@icp-sdk/core/identity"
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
