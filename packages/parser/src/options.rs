use serde::Deserialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Options for DID-to-COD compilation
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DidToCodOptions {
    /// Custom format type definitions for JSDoc generation
    #[serde(rename = "customJSDocFormatTypes", default)]
    pub custom_jsdoc_format_types: HashMap<String, CustomJSDocFormatDefinition>,
}

/// Format definition: either a regex string or a full definition object
#[derive(Clone, Deserialize)]
#[serde(untagged)]
pub enum CustomJSDocFormatDefinition {
    /// Simple regex pattern string
    Regex(String),
    /// Full format definition with optional fields
    Definition(CustomJSDocFormatDefinitionObject),
}

/// Detailed custom format specification for JSDoc generation
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomJSDocFormatDefinitionObject {
    /// Regular expression pattern for the format
    pub regex: Option<String>,
    /// JSON Schema format identifier
    #[serde(rename = "jsonSchemaFormat")]
    pub json_schema_format: Option<String>,
    /// Content encoding specification
    #[serde(rename = "contentEncoding")]
    pub content_encoding: Option<String>,
    /// Error message to display for invalid values
    #[serde(rename = "errorMessage")]
    pub error_message: Option<String>,
}

/// Parse DID-to-COD options from a JsValue
pub fn parse_did_to_cod_options(options: JsValue) -> Result<DidToCodOptions, String> {
    if options.is_null() || options.is_undefined() {
        Ok(DidToCodOptions::default())
    } else {
        serde_wasm_bindgen::from_value(options).map_err(|e| e.to_string())
    }
}
