/* eslint-disable no-undef */
import fetch from "node-fetch"

if (!globalThis.fetch) {
  globalThis.fetch = fetch
}
