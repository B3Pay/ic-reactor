/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Turbopack is the default bundler from Next.js 16 on, and it hard-errors on a
   * config that customises webpack without saying anything about Turbopack. The
   * webpack block below only registers an `extensionAlias`, which Turbopack
   * already does natively for TypeScript projects, so there is nothing to port —
   * an empty block is the migration.
   */
  turbopack: {},

  // Kept for `next build --webpack`.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    }
    return config
  },
}

module.exports = nextConfig
