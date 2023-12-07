module.exports = {
  transform: {
    "^.+\\.svelte$": "svelte-jester",
    "^.+\\.ts$": "ts-jest",
    "^.+\\.js$": "babel-jest",
  },
  moduleFileExtensions: ["js", "ts", "svelte"],
  testPathIgnorePatterns: ["node_modules"],
  bail: false,
  verbose: true,
  transformIgnorePatterns: ["node_modules"],
  setupFilesAfterEnv: ["@testing-library/jest-dom/extend-expect"],
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.json",
    },
  },
}
