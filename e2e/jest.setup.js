/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
import fetch from "node-fetch"
require("dotenv").config({ path: ".env" })

if (!globalThis.fetch) {
  globalThis.fetch = fetch
}
