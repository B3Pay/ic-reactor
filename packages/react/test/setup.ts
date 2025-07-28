import { afterEach, expect } from "bun:test"
import { cleanup } from "@testing-library/react"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import * as matchers from "@testing-library/jest-dom/matchers"

// Register DOM globals
GlobalRegistrator.register()

// @ts-ignore
expect.extend(matchers)

// Cleanup after each test case
afterEach(() => {
  cleanup()
})
