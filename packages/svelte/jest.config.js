module.exports = {
  transform: {
    "^.+\\.[t|j]sx?$": "babel-jest",
  },
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["./jest.setup.js"],
}
