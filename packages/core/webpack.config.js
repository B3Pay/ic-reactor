/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path")
const { IgnorePlugin } = require("webpack")

/** @type {import("webpack").Configuration} */
module.exports = (env, argv) => {
  // Determine if it's a production build
  const isProduction = argv.mode === "production"
  return {
    entry: "./src/index.ts",
    output: {
      path: path.resolve(
        __dirname,
        "umd",
        isProduction ? "production" : "development"
      ),
      filename: isProduction ? "ic-reactor-core.min.js" : "ic-reactor-core.js",
      library: {
        name: "Reactor",
        type: "umd",
      },
    },
    module: {
      rules: [
        {
          test: /\.ts?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
      new IgnorePlugin({
        resourceRegExp: /^@ic-reactor\/parser$/,
      }),
    ],
    resolve: {
      extensions: [".ts", ".js"],
      modules: [
        path.resolve(__dirname, "node_modules"),
        path.resolve(__dirname, "../../node_modules"),
        "node_modules",
      ],
    },
    externals: {},
    // Add source maps in development for easier debugging
    devtool: isProduction ? false : "source-map",
    // Additional production optimizations could be added here
    // For example, optimization: { minimize: true } for Webpack < 4
  }
}
