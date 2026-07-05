use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DocBlock {
    pub lines: Vec<String>,
    pub tags: Vec<DocTag>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocTag {
    pub name: String,
    pub value: String,
}

impl DocBlock {
    pub fn parse(lines: &[String]) -> Self {
        let mut parsed = Self::default();

        for raw in lines {
            let line = normalize_doc_line(raw);
            if let Some(tag) = parse_tag(&line) {
                parsed.tags.push(tag);
            }
            parsed.lines.push(line);
        }

        parsed
    }

    pub fn is_empty(&self) -> bool {
        self.lines.is_empty()
    }

    pub fn has_tag(&self, name: &str) -> bool {
        self.tags.iter().any(|tag| tag.name == name)
    }

    pub fn first_value(&self, name: &str) -> Option<&str> {
        self.tags
            .iter()
            .find(|tag| tag.name == name)
            .map(|tag| tag.value.as_str())
    }

    pub fn values<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a str> {
        self.tags
            .iter()
            .filter(move |tag| tag.name == name)
            .map(|tag| tag.value.as_str())
    }
}

fn normalize_doc_line(raw: &str) -> String {
    let mut line = raw.trim();

    // candid_parser treats `/// text` as a `//` doc line containing `/ text`.
    // Accept that form too so users can write familiar doc comments.
    while let Some(rest) = line.strip_prefix('/') {
        line = rest.trim_start();
    }

    if let Some(rest) = line.strip_prefix('*') {
        line = rest.trim_start();
    }

    line.to_string()
}

fn parse_tag(line: &str) -> Option<DocTag> {
    let rest = line.strip_prefix('@')?;
    let mut parts = rest.splitn(2, char::is_whitespace);
    let name = parts.next()?.trim();
    if name.is_empty() {
        return None;
    }

    let value = parts.next().unwrap_or("").trim().to_string();
    Some(DocTag {
        name: name.to_string(),
        value,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_jsdoc_like_tags_from_candid_doc_lines() {
        let lines = vec![
            "User email".to_string(),
            "@format email Invalid email".to_string(),
            "@minLength 3".to_string(),
        ];

        let docs = DocBlock::parse(&lines);

        assert_eq!(docs.first_value("format"), Some("email Invalid email"));
        assert_eq!(docs.first_value("minLength"), Some("3"));
    }

    #[test]
    fn normalizes_triple_slash_and_block_star_prefixes() {
        let lines = vec!["/ @format email".to_string(), "* @maxLength 10".to_string()];
        let docs = DocBlock::parse(&lines);

        assert_eq!(docs.first_value("format"), Some("email"));
        assert_eq!(docs.first_value("maxLength"), Some("10"));
    }
}
