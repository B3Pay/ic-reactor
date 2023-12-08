module.exports = {
  transform: {
    "^.+\\.[t|j]sx?$": "babel-jest",
    "^.+\\.ts$": "ts-jest",
    "^.+\\.svelte$": [
      "svelte-jester",
      {
        preprocess: true,
      },
    ],
  },
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["./jest.setup.js"],
}
