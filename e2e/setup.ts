import { config } from "dotenv"
import { TextEncoder, TextDecoder } from "util"

config({ path: ".env" })

global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as any

import "fake-indexeddb/auto"
import "@testing-library/jest-dom/vitest"
