import "fake-indexeddb/auto"
import { vi } from "vitest"
import { TextEncoder, TextDecoder } from "util"

global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as any
