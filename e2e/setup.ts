import { TextDecoder, TextEncoder } from "node:util"

// Node's encoders, so that the bytes the agent builds and the bytes it checks
// are Uint8Arrays of the same realm under jsdom.
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder
globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder
