import "fake-indexeddb/auto"
import "@testing-library/jest-dom/vitest"
import { TextEncoder, TextDecoder } from "util"

global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as any
