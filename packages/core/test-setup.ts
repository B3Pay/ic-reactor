/// <reference types="node" />

import "fake-indexeddb/auto"
import { TextEncoder, TextDecoder } from "util"

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder as any
