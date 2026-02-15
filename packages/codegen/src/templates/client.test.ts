import { describe, it, expect } from "vitest"
import { generateClientFile } from "./client"

describe("Client File Generation", () => {
  it("generates correctly with default host", () => {
    const result = generateClientFile()
    expect(result).toMatchSnapshot()
    expect(result).toContain('host: "https://icp-api.io"')
  })

  it("generates correctly with custom host", () => {
    const result = generateClientFile({ host: "http://localhost:4943" })
    expect(result).toContain('host: "http://localhost:4943"')
  })
})
