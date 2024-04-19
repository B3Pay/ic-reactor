import { __wbg_set_wasm } from "./pkg/index_bg"

import("./pkg/index_bg.wasm")
  .then((module) => {
    __wbg_set_wasm(module)
  })
  .catch((error) => {
    console.error("Failed to load WebAssembly module:", error)
  })

// Export any functions or objects provided by the WebAssembly module
export { did_to_js } from "./pkg/index_bg"
