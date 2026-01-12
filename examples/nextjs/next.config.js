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
    "@icp-sdk/candid",
    "@icp-sdk/principal",
    "@icp-sdk/identity",
    "@dfinity/agent",
    "@dfinity/candid",
    "@dfinity/principal"
  ],

  // Turbopack configuration (Next.js 16+ default bundler)
  turbopack: {
    rules: {
      "@dfinity/agent": {
        alias: require("path").resolve(__dirname, "node_modules/@icp-sdk/core")
      },
      "@dfinity/candid": {
        alias: require("path").resolve(
          __dirname,
          "node_modules/@icp-sdk/core/candid"
        )
      },
      "@dfinity/principal": {
        alias: require("path").resolve(
          __dirname,
          "node_modules/@icp-sdk/core/principal"
        )
      },
      "@dfinity/identity": {
        alias: require("path").resolve(
          __dirname,
          "node_modules/@icp-sdk/core/identity"
        )
      }
    }
  },

  // Webpack configuration (for production builds or --webpack flag)
  webpack: (config, { isServer }) => {
    // Add aliases for @dfinity packages to map to @icp-sdk packages
    config.resolve.alias = {
      ...config.resolve.alias,
      "@dfinity/agent": require("path").resolve(
        __dirname,
        "node_modules/@icp-sdk/core"
      ),
      "@dfinity/candid": require("path").resolve(
        __dirname,
        "node_modules/@icp-sdk/core/candid"
      ),
      "@dfinity/principal": require("path").resolve(
        __dirname,
        "node_modules/@icp-sdk/core/principal"
      ),
      "@dfinity/identity": require("path").resolve(
        __dirname,
        "node_modules/@icp-sdk/core/identity"
      )
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
