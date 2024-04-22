// Adjust the path to load env from ../.env file
const envList = require("dotenv").config({ path: "./.env" }).parsed || {}

// Adjust the path to get version from package.json
const { version } = require("./package.json")

envList.NEXT_PUBLIC_IC_HOST =
  envList.DFX_NETWORK === "ic" ? "https://icp-api.io" : "http://127.0.0.1:4943"

envList.NEXT_PUBLIC_VERSION = version

/** @type {import('next').NextConfig} */
module.exports = {
  env: envList,
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
