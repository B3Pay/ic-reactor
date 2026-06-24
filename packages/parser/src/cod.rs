use candid::pretty::utils::*;
use candid::types::{Field, FuncMode, Function, Label, SharedLabel, Type, TypeEnv, TypeInner};
use candid_parser::syntax::{self, IDLActorType, IDLMergedProg, IDLType};
use pretty::RcDoc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::metadata::{
    metadata_from_docs, CandidMetadata, CandidValidationFormat, CandidValidationMetadata,
};
use crate::options::{CustomJSDocFormatDefinition, DidToCodOptions};

fn find_field<'a>(
    fields: Option<&'a [syntax::TypeField]>,
    label: &'a Label,
) -> (Option<CandidMetadata>, Option<&'a IDLType>) {
    if let Some(fields) = fields {
        if let Some(field) = fields.iter().find(|field| field.label == *label) {
            let metadata = metadata_from_docs(&field.docs);
            return (metadata, Some(&field.typ));
        }
    }

    (None, None)
}

fn pp_ty_rich<'a>(
    env: &'a TypeEnv,
    ty: &'a Type,
    syntax: Option<&'a IDLType>,
    is_ref: bool,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    match (ty.as_ref(), syntax) {
        (TypeInner::Record(fields), Some(IDLType::RecordT(syntax_fields))) => {
            pp_record(env, fields, Some(syntax_fields.as_slice()), is_ref, options)
        }
        (TypeInner::Variant(fields), Some(IDLType::VariantT(syntax_fields))) => {
            pp_variant(env, fields, Some(syntax_fields.as_slice()), is_ref, options)
        }
        (TypeInner::Opt(inner), Some(IDLType::OptT(syntax_inner))) => {
            pp_opt(env, inner, Some(syntax_inner.as_ref()), is_ref, options)
        }
        (TypeInner::Vec(inner), Some(IDLType::VecT(syntax_inner))) => {
            pp_vec(env, inner, Some(syntax_inner.as_ref()), is_ref, options)
        }
        (_, _) => pp_ty(env, ty, is_ref, options),
    }
}

fn pp_ty<'a>(
    env: &'a TypeEnv,
    ty: &'a Type,
    is_ref: bool,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    use TypeInner::*;
    match ty.as_ref() {
        Null => str("c.null()"),
        Bool => str("c.bool()"),
        Nat => str("c.nat()"),
        Int => str("c.int()"),
        Nat8 => str("c.nat8()"),
        Nat16 => str("c.nat16()"),
        Nat32 => str("c.nat32()"),
        Nat64 => str("c.nat64()"),
        Int8 => str("c.int8()"),
        Int16 => str("c.int16()"),
        Int32 => str("c.int32()"),
        Int64 => str("c.int64()"),
        Float32 => str("c.float32()"),
        Float64 => str("c.float64()"),
        Text => str("c.text()"),
        Reserved => str("c.reserved()"),
        Empty => str("c.empty()"),
        Var(id) => {
            let ty = env.rec_find_type(id).unwrap();
            if matches!(ty.as_ref(), Func(_)) {
                return pp_inline_func();
            }
            if is_ref && matches!(ty.as_ref(), Service(_)) {
                return pp_inline_service();
            }
            ident(id)
        }
        Principal => str("c.principal()"),
        Opt(inner) => pp_opt(env, inner, None, is_ref, options),
        Vec(inner) => pp_vec(env, inner, None, is_ref, options),
        Record(fields) => pp_record(env, fields, None, is_ref, options),
        Variant(fields) => pp_variant(env, fields, None, is_ref, options),
        Func(_) => pp_inline_func(),
        Service(_) => pp_inline_service(),
        Class(_, _) => unreachable!(),
        Knot(_) | Unknown | Future => unreachable!(),
    }
}

fn pp_inline_func<'a>() -> RcDoc<'a> {
    str("c.func()")
}

fn pp_inline_service<'a>() -> RcDoc<'a> {
    str("c.principal()")
}

fn pp_vec<'a>(
    env: &'a TypeEnv,
    inner: &'a Type,
    syntax: Option<&'a IDLType>,
    is_ref: bool,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    match inner.as_ref() {
        TypeInner::Nat8 => str("c.blob()"),
        _ => str("c.vec").append(enclose(
            "(",
            pp_ty_rich(env, inner, syntax, is_ref, options),
            ")",
        )),
    }
}

fn pp_opt<'a>(
    env: &'a TypeEnv,
    ty: &'a Type,
    syntax: Option<&'a IDLType>,
    is_ref: bool,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    str("c.opt").append(enclose(
        "(",
        pp_ty_rich(env, ty, syntax, is_ref, options),
        ")",
    ))
}

fn pp_label(id: &SharedLabel) -> RcDoc<'_> {
    match &**id {
        Label::Named(name) => property_name(name),
        Label::Id(n) | Label::Unnamed(n) => str("_")
            .append(RcDoc::as_string(n))
            .append("_")
            .append(RcDoc::space()),
    }
}

fn pp_field<'a>(
    env: &'a TypeEnv,
    field: &'a Field,
    syntax: Option<&'a IDLType>,
    metadata: Option<CandidMetadata>,
    is_ref: bool,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    pp_label(&field.id).append(kwd(":")).append(apply_metadata(
        pp_ty_rich(env, &field.ty, syntax, is_ref, options),
        metadata.as_ref(),
        is_text_type(env, &field.ty),
        options,
    ))
}

fn pp_record<'a>(
    env: &'a TypeEnv,
    fields: &'a [Field],
    syntax: Option<&'a [syntax::TypeField]>,
    is_ref: bool,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    if is_tuple_fields(fields) {
        let tuple = concat(
            fields
                .iter()
                .map(|field| pp_ty(env, &field.ty, is_ref, options)),
            ",",
        );
        str("c.tuple").append(enclose("(", enclose("[", tuple, "]"), ")"))
    } else {
        let fields = concat(
            fields.iter().map(|field| {
                let (metadata, syntax_field) = find_field(syntax, &field.id);
                pp_field(env, field, syntax_field, metadata, is_ref, options)
            }),
            ",",
        );
        str("c.record").append(enclose_space("({", fields, "})"))
    }
}

fn pp_variant<'a>(
    env: &'a TypeEnv,
    fields: &'a [Field],
    syntax: Option<&'a [syntax::TypeField]>,
    is_ref: bool,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    let fields = concat(
        fields.iter().map(|field| {
            let (metadata, syntax_field) = find_field(syntax, &field.id);
            pp_field(env, field, syntax_field, metadata, is_ref, options)
        }),
        ",",
    );
    str("c.variant").append(enclose_space("({", fields, "})"))
}

fn pp_mode(mode: &[FuncMode]) -> &'static str {
    if mode.contains(&FuncMode::Oneway) {
        "oneway"
    } else if mode.contains(&FuncMode::Query) {
        "query"
    } else {
        "update"
    }
}

fn pp_function<'a>(
    env: &'a TypeEnv,
    func: &'a Function,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    let args = enclose(
        "[",
        concat(
            func.args.iter().map(|arg| pp_ty(env, arg, true, options)),
            ",",
        ),
        "]",
    );
    let mode = pp_mode(&func.modes);

    if mode == "oneway" {
        return str("c.oneway").append(enclose("(", args, ")"));
    }

    match func.rets.len() {
        0 => str("c.").append(mode).append(enclose("(", args, ")")),
        1 => str("c.").append(mode).append(enclose(
            "(",
            strict_concat(
                vec![args, pp_ty(env, &func.rets[0], true, options)].into_iter(),
                ",",
            ),
            ")",
        )),
        _ => {
            let rets = enclose(
                "[",
                concat(
                    func.rets.iter().map(|ret| pp_ty(env, ret, true, options)),
                    ",",
                ),
                "]",
            );
            str("c.").append(mode).append(enclose(
                "(",
                strict_concat(vec![args, rets].into_iter(), ","),
                ")",
            ))
        }
    }
}

fn pp_service<'a>(
    env: &'a TypeEnv,
    service: &'a [(String, Type)],
    syntax: Option<&'a [syntax::Binding]>,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    let methods = concat(
        service.iter().map(|(id, func)| {
            let metadata = syntax
                .and_then(|bindings| bindings.iter().find(|binding| &binding.id == id))
                .and_then(|binding| metadata_from_docs(&binding.docs));
            let func = match func.as_ref() {
                TypeInner::Func(func) => pp_function(env, func, options),
                TypeInner::Var(id) => ident(id),
                _ => unreachable!(),
            };

            property_name(id).append(kwd(":")).append(apply_metadata(
                func,
                metadata.as_ref(),
                false,
                options,
            ))
        }),
        ",",
    );

    str("c.service").append(enclose_space("({", methods, "})"))
}

fn pp_defs<'a>(
    env: &'a TypeEnv,
    def_list: Vec<&'a str>,
    prog: &'a IDLMergedProg,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    lines(def_list.into_iter().map(|id| {
        let ty = env.find_type(id).unwrap();
        let syntax = prog.lookup(id);
        let syntax_ty = syntax.map(|syntax| &syntax.typ);
        let metadata = syntax.and_then(|syntax| metadata_from_docs(syntax.docs.as_ref()));
        kwd("export const")
            .append(ident(id))
            .append(" = ")
            .append(apply_metadata(
                pp_ty_rich(env, ty, syntax_ty, false, options),
                metadata.as_ref(),
                is_text_type(env, ty),
                options,
            ))
            .append(RcDoc::hardline())
            .append("export type ")
            .append(ident(id))
            .append(" = c.infer<typeof ")
            .append(ident(id))
            .append(">")
    }))
}

fn pp_actor<'a>(
    env: &'a TypeEnv,
    ty: &'a Type,
    syntax: Option<&'a IDLActorType>,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    let actor_ty = match ty.as_ref() {
        TypeInner::Service(_) => ty,
        TypeInner::Class(_, inner) => inner,
        TypeInner::Var(id) => env.rec_find_type(id).unwrap(),
        _ => unreachable!(),
    };

    match actor_ty.as_ref() {
        TypeInner::Service(methods) => {
            let service = pp_service(
                env,
                methods,
                syntax.and_then(|syntax| match &syntax.typ {
                    IDLType::ServT(methods) => Some(methods.as_slice()),
                    IDLType::ClassT(_, inner) => match inner.as_ref() {
                        IDLType::ServT(methods) => Some(methods.as_slice()),
                        _ => None,
                    },
                    _ => None,
                }),
                options,
            );
            let metadata = syntax.and_then(|syntax| metadata_from_docs(syntax.docs.as_ref()));
            kwd("export default").append(apply_metadata(service, metadata.as_ref(), false, options))
        }
        _ => unreachable!(),
    }
}

pub fn compile(
    env: &TypeEnv,
    actor: &Option<Type>,
    prog: &IDLMergedProg,
    options: &DidToCodOptions,
) -> String {
    let syntax_actor = prog.resolve_actor().ok().flatten();
    let def_list: Vec<_> = env.0.iter().map(|pair| pair.0.as_ref()).collect();
    let defs = pp_defs(env, def_list, prog, options);
    let actor = actor
        .as_ref()
        .map(|actor| pp_actor(env, actor, syntax_actor.as_ref(), options))
        .unwrap_or_else(RcDoc::nil);

    let output = RcDoc::text("import { c } from \"@ic-reactor/cod\"\n")
        .append(RcDoc::line())
        .append(defs)
        .append(actor)
        .pretty(LINE_WIDTH)
        .to_string();
    output
}

fn apply_metadata<'a>(
    expression: RcDoc<'a>,
    metadata: Option<&CandidMetadata>,
    is_text: bool,
    options: &'a DidToCodOptions,
) -> RcDoc<'a> {
    let Some(metadata) = metadata else {
        return expression;
    };

    let text_format_helper = if is_text {
        metadata
            .validation
            .as_ref()
            .and_then(|validation| validation.format.as_ref())
            .filter(|format| {
                !options
                    .custom_jsdoc_format_types
                    .contains_key(&format.r#type)
            })
            .and_then(|format| format_helper_for(&format.r#type))
    } else {
        None
    };
    let text_format_message = metadata
        .validation
        .as_ref()
        .and_then(|validation| validation.format.as_ref())
        .and_then(|format| custom_format_message(format));
    let mut rest = metadata_with_custom_format(metadata, options);
    let description = rest.description.take();
    let text_pattern = if is_text {
        metadata
            .validation
            .as_ref()
            .and_then(|validation| validation.pattern.as_ref())
    } else {
        None
    };
    let mut result = if let Some(helper) = text_format_helper {
        strip_format_metadata(&mut rest);
        pp_text_format_helper(&helper, text_format_message)
    } else if let Some(pattern) = text_pattern {
        strip_pattern_metadata(&mut rest);
        pp_text_pattern_helper(pattern)
    } else {
        if has_only_description_docs(&rest.docs, description.as_ref()) {
            rest.docs.clear();
        }
        expression
    };

    if let Some(description) = &description {
        result = result
            .append(".describe")
            .append(enclose("(", json_doc(description), ")"));
    }

    if has_renderable_metadata(&rest) {
        result = result
            .append(".meta")
            .append(enclose("(", json_doc(&rest), ")"));
    }

    result
}

fn metadata_with_custom_format(
    metadata: &CandidMetadata,
    options: &DidToCodOptions,
) -> CandidMetadata {
    let mut metadata = metadata.clone();
    let Some(validation) = &mut metadata.validation else {
        return metadata;
    };
    let Some(format) = &mut validation.format else {
        return metadata;
    };
    let Some(definition) = options.custom_jsdoc_format_types.get(&format.r#type) else {
        return metadata;
    };
    let built_in = format_rule_for(&format.r#type);

    match definition {
        CustomJSDocFormatDefinition::Regex(regex) => {
            format.regex = Some(regex.clone());
            format.json_schema_format = built_in
                .as_ref()
                .and_then(|rule| rule.json_schema_format.clone());
            format.content_encoding = built_in
                .as_ref()
                .and_then(|rule| rule.content_encoding.clone());
            format.error_message = format.message.clone().or_else(|| {
                built_in
                    .as_ref()
                    .and_then(|rule| rule.error_message.clone())
            });
        }
        CustomJSDocFormatDefinition::Definition(definition) => {
            format.regex = definition
                .regex
                .clone()
                .or_else(|| built_in.as_ref().and_then(|rule| rule.regex.clone()));
            format.json_schema_format = definition.json_schema_format.clone().or_else(|| {
                built_in
                    .as_ref()
                    .and_then(|rule| rule.json_schema_format.clone())
            });
            format.content_encoding = definition.content_encoding.clone().or_else(|| {
                built_in
                    .as_ref()
                    .and_then(|rule| rule.content_encoding.clone())
            });
            format.error_message = format
                .message
                .clone()
                .or_else(|| definition.error_message.clone())
                .or_else(|| {
                    built_in
                        .as_ref()
                        .and_then(|rule| rule.error_message.clone())
                });
        }
    }

    format.message = None;
    metadata
}

fn pp_text_format_helper<'a>(helper: &str, message: Option<&String>) -> RcDoc<'a> {
    let call = RcDoc::text(format!("c.{helper}"));
    match message {
        Some(message) => call.append(enclose("(", json_doc(message), ")")),
        None => call.append("()"),
    }
}

fn pp_text_pattern_helper<'a>(pattern: &str) -> RcDoc<'a> {
    str("c.regex").append(enclose("(", json_doc(&pattern), ")"))
}

fn strip_format_metadata(metadata: &mut CandidMetadata) {
    metadata.docs.clear();
    if let Some(validation) = &mut metadata.validation {
        validation.format = None;
        if validation_is_empty(validation) {
            metadata.validation = None;
        }
    }
}

fn strip_pattern_metadata(metadata: &mut CandidMetadata) {
    metadata.docs.clear();
    if let Some(validation) = &mut metadata.validation {
        validation.pattern = None;
        if validation_is_empty(validation) {
            metadata.validation = None;
        }
    }
}

fn validation_is_empty(validation: &CandidValidationMetadata) -> bool {
    validation.minimum.is_none()
        && validation.maximum.is_none()
        && validation.min_length.is_none()
        && validation.max_length.is_none()
        && validation.pattern.is_none()
        && validation.format.is_none()
}

fn has_renderable_metadata(metadata: &CandidMetadata) -> bool {
    !metadata.docs.is_empty() || metadata.validation.is_some()
}

fn has_only_description_docs(docs: &[String], description: Option<&String>) -> bool {
    matches!(description, Some(description) if docs.len() == 1 && docs[0] == *description)
}

fn is_text_type(env: &TypeEnv, ty: &Type) -> bool {
    match ty.as_ref() {
        TypeInner::Text => true,
        TypeInner::Var(id) => env
            .rec_find_type(id)
            .map(|ty| is_text_type(env, ty))
            .unwrap_or(false),
        _ => false,
    }
}

#[derive(Deserialize)]
struct FormatRule {
    helper: Option<String>,
    regex: Option<String>,
    #[serde(rename = "jsonSchemaFormat")]
    json_schema_format: Option<String>,
    #[serde(rename = "contentEncoding")]
    content_encoding: Option<String>,
    #[serde(rename = "errorMessage")]
    error_message: Option<String>,
}

fn format_rules() -> Option<HashMap<String, FormatRule>> {
    serde_json::from_str::<HashMap<String, FormatRule>>(include_str!(
        "../../codegen/src/metadata-rules.json"
    ))
    .ok()
}

fn format_rule_for(format_type: &str) -> Option<FormatRule> {
    let mut rules = format_rules()?;
    rules.remove(format_type)
}

fn format_helper_for(format_type: &str) -> Option<String> {
    format_rule_for(format_type).and_then(|rule| rule.helper)
}

fn custom_format_message(format: &CandidValidationFormat) -> Option<&String> {
    let message = format.message.as_ref()?;
    let default_message = format_rule_for(&format.r#type).and_then(|rule| rule.error_message);

    match default_message {
        Some(default_message) if &default_message == message => None,
        _ => Some(message),
    }
}

fn json_doc<'a, T: Serialize>(value: &T) -> RcDoc<'a> {
    RcDoc::text(serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string()))
}

fn property_name<'a>(name: &'a str) -> RcDoc<'a> {
    if is_valid_identifier(name) && !is_reserved_word(name) {
        str(name)
    } else {
        json_doc(&name)
    }
}

fn ident<'a>(id: &'a str) -> RcDoc<'a> {
    if is_reserved_word(id) {
        str(id).append("_")
    } else {
        str(id)
    }
}

fn is_tuple_fields(fields: &[Field]) -> bool {
    if fields.is_empty() {
        return false;
    }

    fields
        .iter()
        .enumerate()
        .all(|(index, field)| field.id.get_id() == index as u32)
}

fn is_valid_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(first) if first == '_' || first == '$' || first.is_ascii_alphabetic() => {}
        _ => return false,
    }

    chars.all(|ch| ch == '_' || ch == '$' || ch.is_ascii_alphanumeric())
}

fn is_reserved_word(name: &str) -> bool {
    matches!(
        name,
        "abstract"
            | "arguments"
            | "await"
            | "boolean"
            | "break"
            | "byte"
            | "case"
            | "catch"
            | "char"
            | "class"
            | "const"
            | "continue"
            | "debugger"
            | "default"
            | "delete"
            | "do"
            | "double"
            | "else"
            | "enum"
            | "eval"
            | "export"
            | "extends"
            | "false"
            | "final"
            | "finally"
            | "float"
            | "for"
            | "function"
            | "goto"
            | "if"
            | "implements"
            | "import"
            | "in"
            | "instanceof"
            | "int"
            | "interface"
            | "let"
            | "long"
            | "native"
            | "new"
            | "null"
            | "package"
            | "private"
            | "protected"
            | "public"
            | "return"
            | "short"
            | "static"
            | "super"
            | "switch"
            | "synchronized"
            | "this"
            | "throw"
            | "throws"
            | "transient"
            | "true"
            | "try"
            | "typeof"
            | "var"
            | "void"
            | "volatile"
            | "while"
            | "with"
            | "yield"
    )
}

#[cfg(test)]
mod tests {
    use super::compile;
    use crate::{checker, DidToCodOptions};

    fn render(source: &str) -> String {
        let (env, actor, merged) =
            checker::check_source("<test candid>", source).expect("type-checked candid");

        compile(&env, &actor, &merged, &DidToCodOptions::default())
    }

    #[test]
    fn emits_default_service_contract() {
        let code = render(
            r#"
            type Account = record {
              owner : principal;
              subaccount : opt blob;
            };

            type TransferResult = variant {
              Ok : nat;
              Err : text;
            };

            service : {
              icrc1_balance_of : (Account) -> (nat) query;
              icrc1_transfer : (Account) -> (TransferResult);
            }
            "#,
        );

        assert!(code.contains("import { c } from \"@ic-reactor/cod\""));
        assert!(code.contains("export const Account = c.record({"));
        assert!(code.contains("owner: c.principal()"));
        assert!(code.contains("subaccount: c.opt(c.blob())"));
        assert!(code.contains("export type Account = c.infer<typeof Account>"));
        assert!(code.contains("export const TransferResult = c.variant({"));
        assert!(code.contains("Ok: c.nat()"));
        assert!(code.contains("Err: c.text()"));
        assert!(code.contains("export default c.service({"));
        assert!(code.contains("icrc1_balance_of: c.query([Account], c.nat())"));
        assert!(code.contains("icrc1_transfer: c.update([Account], TransferResult)"));
        assert!(!code.contains("idlFactory"));
        assert!(!code.contains("IDL."));
    }

    #[test]
    fn emits_metadata_from_type_field_and_method_docs() {
        let code = render(
            r#"
            /// Account that receives tokens.
            type Account = record {
              /// Owner principal.
              owner : principal;

              /// Contact email.
              /// @format email Invalid email address
              email : text;
            };

            /// Ledger service.
            service : {
              /// Return an account balance.
              balance : (Account) -> (nat) query;
            }
            "#,
        );

        assert!(code.contains(
            "export const Account = c.record({\n  owner: c.principal().describe(\"Owner principal.\")"
        ));
        assert!(code.contains("email: c.email(\"Invalid email address\")"));
        assert!(code.contains(".describe(\"Contact email.\")"));
        assert!(!code.contains("\"format\":{\"type\":\"email\""));
        assert!(code.contains("}).describe(\"Account that receives tokens.\")"));
        assert!(code.contains("balance: c.query([Account], c.nat()).describe("));
        assert!(code.contains("\"Return an account balance.\""));
        assert!(code.contains("export default c.service({"));
    }

    #[test]
    fn quotes_non_identifier_method_names() {
        let code = render(
            r#"
            service : {
              "icrc-1-name" : () -> (text) query;
              default : (nat8) -> ();
            }
            "#,
        );

        assert!(code.contains("\"icrc-1-name\": c.query([], c.text())"));
        assert!(code.contains("\"default\": c.update([c.nat8()])"));
    }

    #[test]
    fn emits_regex_helper_for_text_patterns() {
        let code = render(
            r#"
            type Profile = record {
              /// @pattern ^[a-z0-9-]+$
              slug : text;
            };

            service : {}
            "#,
        );

        assert!(code.contains("slug: c.regex(\"^[a-z0-9-]+$\")"));
        assert!(!code.contains("\"pattern\":\"^[a-z0-9-]+$\""));
    }
}
