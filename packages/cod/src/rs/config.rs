use std::{collections::BTreeMap, fs, path::Path};

use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratorConfig {
    #[serde(default = "default_canister_name")]
    pub canister_name: String,
    #[serde(default = "default_schema_suffix")]
    pub schema_name_suffix: String,
    #[serde(default = "default_emit_banner")]
    pub emit_banner: bool,
    #[serde(default = "default_emit_inferred_types")]
    pub emit_inferred_types: bool,
    #[serde(default, alias = "customJSDocFormatTypes")]
    pub custom_js_doc_format_types: BTreeMap<String, CustomFormat>,
}

impl Default for GeneratorConfig {
    fn default() -> Self {
        Self {
            canister_name: default_canister_name(),
            schema_name_suffix: default_schema_suffix(),
            emit_banner: default_emit_banner(),
            emit_inferred_types: default_emit_inferred_types(),
            custom_js_doc_format_types: BTreeMap::new(),
        }
    }
}

impl GeneratorConfig {
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let raw = fs::read_to_string(path)
            .with_context(|| format!("failed to read config {}", path.display()))?;
        let config = serde_json::from_str(&raw)
            .with_context(|| format!("failed to parse config {}", path.display()))?;
        Ok(config)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum CustomFormat {
    Regex(String),
    Detailed {
        regex: String,
        #[serde(default, rename = "errorMessage")]
        error_message: Option<String>,
    },
}

impl CustomFormat {
    pub fn regex(&self) -> &str {
        match self {
            CustomFormat::Regex(regex) => regex,
            CustomFormat::Detailed { regex, .. } => regex,
        }
    }

    pub fn error_message(&self) -> Option<&str> {
        match self {
            CustomFormat::Regex(_) => None,
            CustomFormat::Detailed { error_message, .. } => error_message.as_deref(),
        }
    }
}

fn default_schema_suffix() -> String {
    "Schema".to_string()
}

fn default_canister_name() -> String {
    "canister".to_string()
}

fn default_emit_banner() -> bool {
    true
}

fn default_emit_inferred_types() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_ts_to_zod_custom_jsdoc_format_property_name() {
        let config: GeneratorConfig = serde_json::from_str(
            r#"{
              "customJSDocFormatTypes": {
                "phone-number": "^\\d{3}-\\d{3}-\\d{4}$"
              }
            }"#,
        )
        .unwrap();

        assert!(config
            .custom_js_doc_format_types
            .contains_key("phone-number"));
    }

    #[test]
    fn accepts_canister_name_property() {
        let config: GeneratorConfig = serde_json::from_str(
            r#"{
              "canisterName": "backend"
            }"#,
        )
        .unwrap();

        assert_eq!(config.canister_name, "backend");
    }
}
