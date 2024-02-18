module.exports = {
  transform: {
    "^.+\\.[t|j]s": "babel-jest",
  },
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["./jest.setup.js"],
}
