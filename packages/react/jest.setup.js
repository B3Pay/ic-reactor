/* eslint-disable no-undef */
import fetch from "node-fetch"
import "fake-indexeddb/auto"

if (!globalThis.fetch) {
  globalThis.fetch = fetch
}
