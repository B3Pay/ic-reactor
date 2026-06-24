//! Node filesystem bridge for the import-aware parser build.
//!
//! Adapted from DFINITY's `icp-js-bindgen` filesystem shim, Apache-2.0.

use std::path::Path;

use candid_parser::{Error, Result};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "fs")]
extern "C" {
    #[wasm_bindgen(js_name = "readFileSync", catch)]
    fn read_file_sync(path: &str, encoding: &str) -> std::result::Result<String, JsValue>;
}

pub fn read_file_utf8(path: &Path) -> Result<String> {
    read_file_sync(path.to_str().unwrap_or_default(), "utf-8")
        .map_err(|error| Error::msg(format!("failed to read {}: {:?}", path.display(), error)))
}
