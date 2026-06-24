use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Metadata container for Candid items with descriptions and validation rules
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub docs: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation: Option<CandidValidationMetadata>,
}

/// Validation metadata for Candid types
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidValidationMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimum: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub maximum: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_length: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_length: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<CandidValidationFormat>,
}

/// A validation bound (minimum, maximum, etc.) with optional message
#[derive(Clone, Serialize)]
pub struct CandidValidationBound {
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Format validation specification
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidValidationFormat {
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub regex: Option<String>,
    #[serde(rename = "jsonSchemaFormat", skip_serializing_if = "Option::is_none")]
    pub json_schema_format: Option<String>,
    #[serde(rename = "contentEncoding", skip_serializing_if = "Option::is_none")]
    pub content_encoding: Option<String>,
    #[serde(rename = "errorMessage", skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

/// Metadata rule for error messages
#[derive(Debug, Deserialize, Clone)]
struct MetadataRule {
    #[serde(rename = "errorMessage")]
    error_message: Option<String>,
}

/// Validation bound rule template
#[derive(Debug, Deserialize, Clone)]
struct ValidationBoundRule {
    template: String,
}

/// File containing default validation message rules
#[derive(Debug, Deserialize, Clone)]
struct MetadataRulesFile {
    #[serde(rename = "defaultValidationMessages")]
    default_validation_messages: HashMap<String, ValidationBoundRule>,
}

/// Parse Candid documentation lines into metadata
pub fn metadata_from_docs(docs: &[String]) -> Option<CandidMetadata> {
    if docs.is_empty() {
        return None;
    }

    let normalized_docs: Vec<String> = docs.iter().map(|line| normalize_doc_line(line)).collect();
    let description_lines: Vec<String> = normalized_docs
        .iter()
        .map(|line| line.as_str())
        .filter(|line| !line.is_empty() && !line.starts_with('@'))
        .map(str::to_string)
        .collect();
    let description = if description_lines.is_empty() {
        None
    } else {
        Some(description_lines.join("\n"))
    };
    let validation = validation_from_docs(&normalized_docs);

    Some(CandidMetadata {
        description,
        docs: normalized_docs,
        validation,
    })
}

/// Normalize a documentation line by trimming and removing leading comment markers
fn normalize_doc_line(line: &str) -> String {
    line.trim()
        .strip_prefix('/')
        .map(str::trim)
        .unwrap_or_else(|| line.trim())
        .to_string()
}

/// Extract validation metadata from documentation lines
fn validation_from_docs(docs: &[String]) -> Option<CandidValidationMetadata> {
    let mut validation = CandidValidationMetadata::default();

    for doc in docs {
        let line = doc.trim();
        if let Some(rest) = line.strip_prefix("@minimum ") {
            validation.minimum = parse_bound(rest);
        } else if let Some(rest) = line.strip_prefix("@maximum ") {
            validation.maximum = parse_bound(rest);
        } else if let Some(rest) = line.strip_prefix("@minLength ") {
            validation.min_length = parse_bound(rest);
        } else if let Some(rest) = line.strip_prefix("@maxLength ") {
            validation.max_length = parse_bound(rest);
        } else if let Some(rest) = line.strip_prefix("@pattern ") {
            let pattern = rest.trim();
            if !pattern.is_empty() {
                validation.pattern = Some(pattern.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("@format ") {
            validation.format = parse_format(rest);
        }
    }

    apply_default_validation_messages(&mut validation);

    if validation.minimum.is_some()
        || validation.maximum.is_some()
        || validation.min_length.is_some()
        || validation.max_length.is_some()
        || validation.pattern.is_some()
        || validation.format.is_some()
    {
        Some(validation)
    } else {
        None
    }
}

/// Apply default validation messages to validation metadata
fn apply_default_validation_messages(validation: &mut CandidValidationMetadata) {
    validation.minimum = with_default_bound_message(validation.minimum.take(), "minimum");
    validation.maximum = with_default_bound_message(validation.maximum.take(), "maximum");
    validation.min_length = with_default_bound_message(validation.min_length.take(), "minLength");
    validation.max_length = with_default_bound_message(validation.max_length.take(), "maxLength");
    validation.format = with_default_format_message(validation.format.take());
}

/// Attach default message to a bound if not already present
fn with_default_bound_message(
    bound: Option<CandidValidationBound>,
    kind: &str,
) -> Option<CandidValidationBound> {
    let mut bound = bound?;

    if bound.message.is_none() {
        bound.message = Some(default_bound_message(kind, &bound.value));
    }

    Some(bound)
}

/// Attach default message to a format if not already present
fn with_default_format_message(
    format: Option<CandidValidationFormat>,
) -> Option<CandidValidationFormat> {
    let mut format = format?;

    if format.message.is_none() {
        format.message = default_format_message(&format.r#type);
    }

    Some(format)
}

/// Generate default validation message for a bound
fn default_bound_message(kind: &str, value: &str) -> String {
    let rules = default_bound_rules();
    let template = rules
        .get(kind)
        .map(|rule| rule.template.as_str())
        .unwrap_or(match kind {
            "minimum" => "Must be at least {value}",
            "maximum" => "Must be at most {value}",
            "minLength" => "Must be at least {value} character{plural}",
            "maxLength" => "Must be at most {value} character{plural}",
            _ => "{value}",
        });

    template
        .replace("{value}", value)
        .replace("{plural}", if value == "1" { "" } else { "s" })
}

/// Load format validation rules from metadata-rules.json
fn format_rules() -> HashMap<String, MetadataRule> {
    serde_json::from_str(include_str!("../../codegen/src/metadata-rules.json"))
        .unwrap_or_default()
}

/// Load default validation message templates from metadata-rules.json
fn default_bound_rules() -> HashMap<String, ValidationBoundRule> {
    serde_json::from_str::<MetadataRulesFile>(include_str!("../../codegen/src/metadata-rules.json"))
        .map(|rules| rules.default_validation_messages)
        .unwrap_or_default()
}

/// Get default error message for a format type
fn default_format_message(format_type: &str) -> Option<String> {
    format_rules()
        .get(format_type)
        .and_then(|rule| rule.error_message.clone())
}

/// Parse a validation bound from a string
fn parse_bound(raw: &str) -> Option<CandidValidationBound> {
    let mut parts = raw.trim().splitn(2, char::is_whitespace);
    let value = parts.next()?.trim();
    if value.is_empty() {
        return None;
    }
    let message = parts
        .next()
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(str::to_string);

    Some(CandidValidationBound {
        value: value.to_string(),
        message,
    })
}

/// Parse a format validation specification from a string
fn parse_format(raw: &str) -> Option<CandidValidationFormat> {
    let mut parts = raw.trim().splitn(2, char::is_whitespace);
    let format_type = parts.next()?.trim();
    if format_type.is_empty() {
        return None;
    }
    let message = parts
        .next()
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(str::to_string);

    Some(CandidValidationFormat {
        r#type: format_type.to_string(),
        message,
        regex: None,
        json_schema_format: None,
        content_encoding: None,
        error_message: None,
    })
}
