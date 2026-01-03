const path = require("path")

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
  transpilePackages: [
    "@ic-reactor/react",
    "@ic-reactor/core",
    "@icp-sdk/core",
    "@icp-sdk/agent",
    "@icp-sdk/auth",
    "@icp-sdk/candid",
    "@icp-sdk/principal"
  ],
  // Ensure only one React instance is used in the monorepo
  webpack: config => {
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom")
    }
    return config
  },
  redirects: async () => {
    return [
      {
        source: "/api",
        destination: envList.NEXT_PUBLIC_IC_HOST,
        permanent: true
      }
    ]
  },
  images: {
    unoptimized: true
  },
  staticPageGenerationTimeout: 100
}
