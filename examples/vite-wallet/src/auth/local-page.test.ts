// Where the dev account is offered: a page served from this machine.
import { describe, expect, it } from "vitest"
import { isLocalPage } from "./local-page.ts"

const page = (origin: string) => ({
  origin,
  hostname: new URL(origin).hostname,
})

describe("a local page", () => {
  it.each([
    "http://localhost:5175",
    "http://app.localhost:5175",
    "http://127.0.0.1:5185",
    "http://[::1]:5175",
  ])("%s is local", (origin) => {
    expect(isLocalPage(page(origin))).toBe(true)
  })

  it.each([
    "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io",
    "https://notlocalhost.com",
    "https://localhost.example.com",
    "https://wallet.example.com",
  ])("%s is not", (origin) => {
    expect(isLocalPage(page(origin))).toBe(false)
  })
})
