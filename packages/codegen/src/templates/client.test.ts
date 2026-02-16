import { describe, it, expect } from "vitest"
import { generateClientFile } from "./client"

describe("Client File Generation", () => {
  it("generates correctly with default host", () => {
    const result = generateClientFile()
    expect(result).toMatchSnapshot()
    expect(result).toContain(
      'import { QueryClient } from "@tanstack/react-query'
    )
  })

  it("generates correctly with custom query client", () => {
    const result = generateClientFile({
      queryClientPath: "../query-client",
    })
    expect(result).toMatchSnapshot()
    expect(result).toContain('import { queryClient } from "../query-client"')
  })
})
