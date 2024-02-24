/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path")

module.exports = {
  entry: "./src/index.ts", // Your entry point file
  output: {
    path: path.resolve(__dirname, "bundle"),
    filename: "bundle.js", // Output file
    library: {
      name: "@ic-reactor", // Exported library name
      type: "umd", // Universal module definition
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-typescript"],
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    modules: [path.resolve(__dirname, "node_modules"), "node_modules"],
  },
  // If there are specific modules you still want to leave as external:
  externals: {
    // "react": "React",
    // Define externals here
  },
}
