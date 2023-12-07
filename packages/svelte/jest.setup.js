import { Crypto } from "@peculiar/webcrypto"
import "fake-indexeddb/auto"
global.crypto = new Crypto()
global.TextEncoder = require("text-encoding").TextEncoder
global.TextDecoder = require("text-encoding").TextDecoder
require("whatwg-fetch")
global.XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest
