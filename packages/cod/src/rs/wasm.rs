use wasm_bindgen::prelude::*;

use crate::core::CandidProgram;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct WasmCandidProgram {
    inner: CandidProgram,
}

#[wasm_bindgen]
impl WasmCandidProgram {
    #[wasm_bindgen(constructor)]
    pub fn new(source: &str) -> Result<WasmCandidProgram, JsValue> {
        Ok(Self {
            inner: CandidProgram::from_source(source).map_err(to_js_error)?,
        })
    }

    #[wasm_bindgen(js_name = summaryJson)]
    pub fn summary_json(&self) -> Result<String, JsValue> {
        serde_json::to_string_pretty(&self.inner.summary().map_err(to_js_error)?)
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = irJson)]
    pub fn ir_json(&self) -> Result<String, JsValue> {
        self.inner.ir_json().map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = serviceDid)]
    pub fn service_did(&self) -> Result<String, JsValue> {
        self.inner.service_did().map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = encodeMethodArgs)]
    pub fn encode_method_args(&self, method: &str, args_text: &str) -> Result<Vec<u8>, JsValue> {
        self.inner
            .encode_method_args(method, args_text)
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = decodeMethodArgs)]
    pub fn decode_method_args(&self, method: &str, bytes: &[u8]) -> Result<String, JsValue> {
        self.inner
            .decode_method_args(method, bytes)
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = encodeMethodReply)]
    pub fn encode_method_reply(&self, method: &str, reply_text: &str) -> Result<Vec<u8>, JsValue> {
        self.inner
            .encode_method_reply(method, reply_text)
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = decodeMethodReply)]
    pub fn decode_method_reply(&self, method: &str, bytes: &[u8]) -> Result<String, JsValue> {
        self.inner
            .decode_method_reply(method, bytes)
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = encodeInitArgs)]
    pub fn encode_init_args(&self, args_text: &str) -> Result<Vec<u8>, JsValue> {
        self.inner.encode_init_args(args_text).map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = decodeInitArgs)]
    pub fn decode_init_args(&self, bytes: &[u8]) -> Result<String, JsValue> {
        self.inner.decode_init_args(bytes).map_err(to_js_error)
    }
}

#[wasm_bindgen(js_name = encodeDynamicArgs)]
pub fn encode_dynamic_args(args_text: &str) -> Result<Vec<u8>, JsValue> {
    CandidProgram::encode_dynamic_args(args_text).map_err(to_js_error)
}

#[wasm_bindgen(js_name = decodeDynamicArgs)]
pub fn decode_dynamic_args(bytes: &[u8]) -> Result<String, JsValue> {
    CandidProgram::decode_dynamic_args(bytes).map_err(to_js_error)
}

#[wasm_bindgen(js_name = generateTypescript)]
pub fn generate_typescript_wasm(source: &str) -> Result<String, JsValue> {
    crate::generate_typescript_from_source(source, &crate::GeneratorConfig::default())
        .map_err(to_js_error)
}

#[wasm_bindgen(js_name = generateTypescriptForCanister)]
pub fn generate_typescript_for_canister_wasm(
    source: &str,
    canister_name: &str,
) -> Result<String, JsValue> {
    let config = crate::GeneratorConfig {
        canister_name: canister_name.to_string(),
        ..crate::GeneratorConfig::default()
    };
    crate::generate_typescript_from_source(source, &config).map_err(to_js_error)
}

fn to_js_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}
