// Adjust the path to load env from ../.env file
const envList = require("dotenv").config({ path: "./.env" }).parsed || {}

// Adjust the path to get version from package.json
const { version } = require("./package.json")

envList.NEXT_PUBLIC_IC_HOST =
  envList.DFX_NETWORK === "ic" ? "https://icp-api.io" : "http://127.0.0.1:4943"

envList.NEXT_PUBLIC_VERSION = version

/** @type {import('next').NextConfig} */
module.exports = {
  output: "export",
  env: envList,
  turbopack: {
    root: __dirname
  },
  images: {
    unoptimized: true
  },
  // Transpile IC Reactor packages
  transpilePackages: [
    "@ic-reactor/react",
    "@ic-reactor/core",
    "@icp-sdk/core",
    "@icp-sdk/auth",
    "@dfinity/agent",
    "@dfinity/candid",
    "@dfinity/principal"
  ],

  // Turbopack configuration (Next.js 16+ default bundler)
  turbopack: {
    // Add any Turbopack-specific configuration here if needed
  },

  // Webpack configuration (for production builds or --webpack flag)
  webpack: (config, { isServer }) => {
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
