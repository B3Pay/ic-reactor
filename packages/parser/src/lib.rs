use candid_parser::candid::{idl_hash, types::Label};
use candid_parser::syntax::{
    Binding, Dec, IDLActorType, IDLMergedProg, IDLProg, IDLType, TypeField,
};
use candid_parser::{check_prog, TypeEnv};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Parses Candid source and rejects `import service`.
///
/// `import service "base.did"` merges the service in base.did into this one.
/// A source string cannot load base.did, and `check_prog` skips imports, so the
/// result would silently lack every imported method. A plain `import` only
/// brings in types, and using a type that only the imported file declares
/// already fails type checking, so plain imports stay allowed.
fn parse_prog(prog: &str) -> Result<IDLProg, String> {
    let ast = prog.parse::<IDLProg>().map_err(|e| e.to_string())?;
    reject_service_imports(&ast)?;
    Ok(ast)
}

fn reject_service_imports(ast: &IDLProg) -> Result<(), String> {
    for dec in &ast.decs {
        if let Dec::ImportServ(path) = dec {
            return Err(format!(
                "import service \"{path}\" is not supported. Imports cannot be resolved \
                 from a single Candid source string, so the methods of the imported \
                 service would be missing. Copy those methods into this service instead."
            ));
        }
    }
    Ok(())
}

/// The parameter `didToJs`'s `idlFactory` and `init` take the IDL namespace as.
const JS_IDL_PARAMETER: &str = "IDL";

/// The names `didToTs` output imports, each with its module.
const TS_IMPORTS: [(&str, &str); 2] = [
    ("Principal", "@icp-sdk/core/principal"),
    ("ActorMethod", "@icp-sdk/core/agent"),
];

/// The global types `didToTs` output names: `Array<T>` for a `vec`, and a
/// typed array for a `vec` of fixed-size numbers.
const TS_GLOBALS: [&str; 9] = [
    "Array",
    "Uint8Array",
    "Uint16Array",
    "Uint32Array",
    "BigUint64Array",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "BigInt64Array",
];

/// The names candid_parser's JavaScript and TypeScript printers write with a
/// `_` appended when a type has one (`class` as `class_`). A copy of
/// `KEYWORDS` in candid_parser 0.4.1's `bindings/javascript.rs`, which is
/// private.
const JS_KEYWORDS: [&str; 64] = [
    "abstract",
    "arguments",
    "await",
    "boolean",
    "break",
    "byte",
    "case",
    "catch",
    "char",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "double",
    "else",
    "enum",
    "eval",
    "export",
    "extends",
    "false",
    "final",
    "finally",
    "float",
    "for",
    "function",
    "goto",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "int",
    "interface",
    "let",
    "long",
    "native",
    "new",
    "null",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "short",
    "static",
    "super",
    "switch",
    "synchronized",
    "this",
    "throw",
    "throws",
    "transient",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "volatile",
    "while",
    "with",
    "yield",
];

#[wasm_bindgen(js_name = didToJs)]
pub fn did_to_js(prog: String) -> Result<String, String> {
    let mut ast = parse_prog(&prog)?;
    let mut env = TypeEnv::new();
    let mut actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;

    // Each type is a `const` of its own name inside `({ IDL }) => { … }`, so a
    // type named `IDL` redeclared the parameter: a SyntaxError, and the module
    // did not load. The const is local to the factories, so it takes another
    // name there, the way candid_parser appends `_` to a keyword.
    if env.0.contains_key(JS_IDL_PARAMETER) {
        let local = unused_type_name(&env, &format!("{JS_IDL_PARAMETER}_"));
        rename_type(&mut ast, JS_IDL_PARAMETER, &local);
        env = TypeEnv::new();
        actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    }
    if rename_keyword_actor_type(&mut ast, &env) {
        env = TypeEnv::new();
        actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    }
    if hash_numeric_looking_labels(&mut ast) {
        env = TypeEnv::new();
        actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    }

    let res = candid_parser::bindings::javascript::compile(&env, &actor);

    Ok(hex_nul_escapes(&computed_proto_keys(&res)))
}

/// The type the actor names: `T` in `service : T` and `service : (…) -> T`.
fn actor_type_name(ast: &IDLProg) -> Option<&str> {
    let mut ty = &ast.actor.as_ref()?.typ;
    loop {
        match ty {
            IDLType::VarT(id) => return Some(id),
            IDLType::ClassT(_, inner) => ty = inner,
            _ => return None,
        }
    }
}

/// Renames the actor's type when it is named like a JavaScript keyword, and
/// returns whether it did.
///
/// candid_parser prints such a type with a `_` appended wherever it declares
/// or refers to it, but writes the actor line with the bare name: `didToJs`
/// wrote `return class;` and `didToTs` `export interface _SERVICE extends
/// class {}`, and neither parses. Renamed to the name its declaration already
/// prints, or to the first free name with more `_`, the type prints as before
/// and the actor line refers to it.
fn rename_keyword_actor_type(ast: &mut IDLProg, env: &TypeEnv) -> bool {
    let keyword = match actor_type_name(ast) {
        Some(name) if JS_KEYWORDS.contains(&name) => name.to_string(),
        _ => return false,
    };
    let renamed = unused_type_name(env, &format!("{keyword}_"));
    rename_type(ast, &keyword, &renamed);
    true
}

/// `candidate`, or `candidate` followed by as many `_` as it takes to name no
/// type in `env`.
fn unused_type_name(env: &TypeEnv, candidate: &str) -> String {
    let mut name = candidate.to_string();
    while env.0.contains_key(&name) {
        name.push('_');
    }
    name
}

/// Calls `visit` on every type in `ast`: each declared type, the actor's type,
/// and every type nested in them, outer types first.
fn visit_types<F: FnMut(&mut IDLType)>(ast: &mut IDLProg, visit: &mut F) {
    fn visit_in<F: FnMut(&mut IDLType)>(ty: &mut IDLType, visit: &mut F) {
        visit(ty);
        match ty {
            IDLType::FuncT(func) => {
                for arg in func.args.iter_mut().chain(func.rets.iter_mut()) {
                    visit_in(&mut arg.typ, visit);
                }
            }
            IDLType::OptT(inner) | IDLType::VecT(inner) => visit_in(inner, visit),
            IDLType::RecordT(fields) | IDLType::VariantT(fields) => {
                for field in fields {
                    visit_in(&mut field.typ, visit);
                }
            }
            IDLType::ServT(methods) => {
                for method in methods {
                    visit_in(&mut method.typ, visit);
                }
            }
            IDLType::ClassT(args, inner) => {
                for arg in args {
                    visit_in(&mut arg.typ, visit);
                }
                visit_in(inner, visit);
            }
            IDLType::VarT(_) | IDLType::PrimT(_) | IDLType::PrincipalT => {}
        }
    }

    for dec in &mut ast.decs {
        if let Dec::TypD(binding) = dec {
            visit_in(&mut binding.typ, visit);
        }
    }
    if let Some(actor) = &mut ast.actor {
        visit_in(&mut actor.typ, visit);
    }
}

/// Renames the type `from` to `to` in `ast`: its declaration and every
/// reference to it. Field labels and method names are not type names and stay.
fn rename_type(ast: &mut IDLProg, from: &str, to: &str) {
    for dec in &mut ast.decs {
        if let Dec::TypD(binding) = dec {
            if binding.id == from {
                binding.id = to.to_string();
            }
        }
    }
    visit_types(ast, &mut |ty| {
        if let IDLType::VarT(id) = ty {
            if id == from {
                *id = to.to_string();
            }
        }
    });
}

/// Whether `@icp-sdk/core` reads a record field or variant tag key as a number
/// instead of hashing it: the key is spelled `_<digits>_` or `_0x<hex>_`, and
/// the number is below 2^32. A copy of the rule in its `idlLabelToId`.
fn reads_as_number(name: &str) -> bool {
    let Some(inner) = name.strip_prefix('_').and_then(|n| n.strip_suffix('_')) else {
        return false;
    };
    let (digits, radix) = match inner.strip_prefix("0x") {
        Some(hex) if !hex.is_empty() && hex.bytes().all(|b| b.is_ascii_hexdigit()) => (hex, 16),
        _ if !inner.is_empty() && inner.bytes().all(|b| b.is_ascii_digit()) => (inner, 10),
        _ => return false,
    };
    // The digits are checked above, so this only fails on overflow, and a
    // number from 2^32 up is hashed as a name.
    u32::from_str_radix(digits, radix).is_ok()
}

/// Rewrites each record field and variant tag whose name `@icp-sdk/core`
/// reads as a number, such as `_0_`, as the id the name hashes to, and returns
/// whether it rewrote one.
///
/// A named field's id is the hash of its name, whatever the name looks like,
/// so a canister expects the field `_0_` as hash("_0_") = 4735054.
/// candid_parser prints the field as the key `'_0_'`, the key it prints the
/// field `0` as, and `@icp-sdk/core` reads a key spelled like that as the
/// number. The call carried id 0 instead, and the canister rejected it, or read
/// an `opt` field as none. `record { _0_ : nat; 0 : text }` printed both
/// fields under one key, and the object literal kept only the last.
///
/// A rewritten field prints under its hash, `_4735054_`, the way candid_parser
/// prints a numeric field, in both `didToJs` and `didToTs`, so the types and
/// the IDL use the same key. Every other name prints as before, including one
/// `@icp-sdk/core` hashes itself, such as `_4294967296_`.
fn hash_numeric_looking_labels(ast: &mut IDLProg) -> bool {
    let mut rewritten = false;
    visit_types(ast, &mut |ty| {
        if let IDLType::RecordT(fields) | IDLType::VariantT(fields) = ty {
            for field in fields {
                if let Label::Named(name) = &field.label {
                    if reads_as_number(name) {
                        field.label = Label::Id(idl_hash(name));
                        rewritten = true;
                    }
                }
            }
        }
    });
    rewritten
}

/// Replaces each identifier in `code` that `names` maps, outside quoted
/// strings and comments.
///
/// `names` holds type names and the binding's own names. candid_parser prints
/// field labels and method names as quoted strings and docs as comments, so
/// outside those such a name always refers to the type or to the binding.
fn rename_identifiers(code: &str, names: &HashMap<String, String>) -> String {
    let is_identifier = |c: char| c.is_ascii_alphanumeric() || c == '_' || c == '$';
    let mut out = String::with_capacity(code.len());
    let mut rest = code;
    while let Some(c) = rest.chars().next() {
        let len = if c == '\'' {
            quoted_len(rest)
        } else if let Some(comment) = rest.strip_prefix("/*") {
            comment.find("*/").map_or(rest.len(), |end| end + 4)
        } else if rest.starts_with("//") {
            rest.find('\n').unwrap_or(rest.len())
        } else if is_identifier(c) {
            let len = rest.find(|c: char| !is_identifier(c)).unwrap_or(rest.len());
            if let Some(name) = names.get(&rest[..len]) {
                out.push_str(name);
                rest = &rest[len..];
                continue;
            }
            len
        } else {
            c.len_utf8()
        };
        out.push_str(&rest[..len]);
        rest = &rest[len..];
    }
    out
}

/// Rewrites each `\0` escape inside a single-quoted string of `didToJs` or
/// `didToTs` output as `\x00`.
///
/// candid_parser quotes names with Rust's `escape_debug`, which writes U+0000
/// as `\0`. In JavaScript and TypeScript, `\0` followed by a digit is a legacy
/// octal escape instead: a syntax error in a module, so the generated
/// declarations did not load or compile, and in sloppy code, as
/// `importCandidDefinition` evaluates it, another character. The name `"\001"`
/// (U+0000 then `1`) printed as `'\01'` and became U+0001, a different field
/// hash, so the call carried different bytes than the canister expects.
///
/// Comments are skipped: `didToTs` prints doc comments, which may hold a `'`.
fn hex_nul_escapes(code: &str) -> String {
    let mut out = String::with_capacity(code.len());
    let mut chars = code.chars().peekable();
    while let Some(c) = chars.next() {
        out.push(c);
        match c {
            '\'' => {
                while let Some(c) = chars.next() {
                    match c {
                        '\\' => match chars.next() {
                            Some('0') => out.push_str("\\x00"),
                            Some(escaped) => {
                                out.push('\\');
                                out.push(escaped);
                            }
                            None => out.push('\\'),
                        },
                        '\'' => {
                            out.push(c);
                            break;
                        }
                        _ => out.push(c),
                    }
                }
            }
            '/' if chars.peek() == Some(&'*') => {
                out.push(chars.next().unwrap());
                let mut prev = ' ';
                for c in chars.by_ref() {
                    out.push(c);
                    if prev == '*' && c == '/' {
                        break;
                    }
                    prev = c;
                }
            }
            '/' if chars.peek() == Some(&'/') => {
                for c in chars.by_ref() {
                    out.push(c);
                    if c == '\n' {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

/// Rewrites each `'__proto__' : …` entry of `didToJs` output as
/// `['__proto__'] : …`.
///
/// candid_parser prints each record field, variant tag and service method as a
/// quoted key in an object literal, such as `IDL.Record({ 'id' : IDL.Nat })`.
/// A `'__proto__'` key in an object literal sets the object's prototype instead
/// of adding a property, so a Candid name spelled `__proto__` vanished from the
/// IDL type without an error. A computed key adds an ordinary property.
///
/// The output is read one quoted string at a time instead of searched for the
/// text, because another name can end in the same characters: `a'__proto__`
/// prints as `'a\'__proto__'`.
fn computed_proto_keys(js: &str) -> String {
    let mut out = String::with_capacity(js.len());
    let mut rest = js;
    while let Some(start) = rest.find('\'') {
        out.push_str(&rest[..start]);
        let from_quote = &rest[start..];
        let (quoted, after) = from_quote.split_at(quoted_len(from_quote));
        // A key is followed by ` :`. The only other quoted strings are method
        // annotations, such as `['query']`.
        if quoted == "'__proto__'" && after.starts_with(" :") {
            out.push('[');
            out.push_str(quoted);
            out.push(']');
        } else {
            out.push_str(quoted);
        }
        rest = after;
    }
    out.push_str(rest);
    out
}

/// Length in bytes of the single-quoted string at the start of `s`, both quotes
/// included. candid_parser escapes a quote inside a name as `\'`.
fn quoted_len(s: &str) -> usize {
    let mut escaped = false;
    for (index, c) in s.char_indices().skip(1) {
        if escaped {
            escaped = false;
        } else if c == '\\' {
            escaped = true;
        } else if c == '\'' {
            return index + 1;
        }
    }
    s.len()
}

#[wasm_bindgen(js_name = didToTs)]
pub fn did_to_ts(prog: String) -> Result<String, String> {
    let mut ast = parse_prog(&prog)?;
    let mut env = TypeEnv::new();
    let mut actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    if rename_keyword_actor_type(&mut ast, &env) {
        env = TypeEnv::new();
        actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    }
    if hash_numeric_looking_labels(&mut ast) {
        env = TypeEnv::new();
        actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    }

    // The output exports each type under its own name, and also names the
    // imports `Principal` and `ActorMethod`, and the global `Array` and typed
    // arrays. A type with one of those names conflicted with the import
    // (TS2440) or hid the global, and the file's references to the name meant
    // the other one: a method taking the Candid type was typed as taking the
    // SDK's class, and `Array<string>` was not generic (TS2315). The type's
    // name is public, so it stays, and the output reaches the import through
    // an alias and the global through `globalThis`.
    //
    // The printer writes both as the same identifier. To tell them apart,
    // such a type is printed with a `$` after its name, which no Candid name
    // can contain, and renamed back afterwards. `Principal$` sorts where
    // `Principal` does, so the declarations keep their order.
    let mut renames = HashMap::new();
    let mut imports = Vec::new();
    for (name, module) in TS_IMPORTS {
        if env.0.contains_key(name) {
            let alias = unused_type_name(&env, &format!("__{name}"));
            imports.push((
                format!("import type {{ {alias} }} from '{module}';"),
                format!("import type {{ {name} as {alias} }} from '{module}';"),
            ));
            renames.insert(name.to_string(), alias);
        }
    }
    for name in TS_GLOBALS {
        if env.0.contains_key(name) {
            renames.insert(name.to_string(), format!("globalThis.{name}"));
        }
    }
    if !renames.is_empty() {
        let clashing: Vec<String> = renames.keys().cloned().collect();
        for name in clashing {
            let placeholder = format!("{name}$");
            rename_type(&mut ast, &name, &placeholder);
            renames.insert(placeholder, name);
        }
        env = TypeEnv::new();
        actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    }

    let merged = IDLMergedProg::new(ast);
    let mut res = candid_parser::bindings::typescript::compile(&env, &actor, &merged);

    if !renames.is_empty() {
        res = rename_identifiers(&res, &renames);
        for (renamed, aliased) in &imports {
            res = res.replacen(renamed, aliased, 1);
        }
    }

    Ok(hex_nul_escapes(&res))
}

#[wasm_bindgen(js_name = validateIDL)]
pub fn validate_idl(prog: String) -> Result<bool, String> {
    let ast = parse_prog(&prog)?;
    let mut env = TypeEnv::new();
    check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Returns whether `newDid` is a compatible upgrade of `oldDid`, so every
/// client of the old interface can keep calling the new one. Returns `false`
/// when it is not. Throws when either source does not parse or type-check,
/// declares no service, or uses `import service`, which cannot be resolved from
/// a source string.
#[wasm_bindgen(js_name = verifyCompatibility)]
pub fn verify_compatibility(
    #[wasm_bindgen(js_name = oldDid)] old_did: String,
    #[wasm_bindgen(js_name = newDid)] new_did: String,
) -> Result<bool, String> {
    // service_compatible fails the same way for an incompatible upgrade and for
    // a source it cannot load. Check both sources first, so only an
    // incompatible upgrade turns into `false`.
    for (did, label) in [(&old_did, "old"), (&new_did, "new")] {
        validate_idl(did.clone())?;
        let (_, service) = candid_parser::utils::CandidSource::Text(did)
            .load()
            .map_err(|e| e.to_string())?;
        if service.is_none() {
            return Err(format!("The {label} interface declares no service."));
        }
    }

    Ok(candid_parser::utils::service_compatible(
        candid_parser::utils::CandidSource::Text(&new_did),
        candid_parser::utils::CandidSource::Text(&old_did),
    )
    .is_ok())
}

/// @deprecated Use `verifyCompatibility(oldDid, newDid)`. This function takes
/// the new interface first, as `verifyCompatability(newDid, oldDid)`, and throws
/// instead of returning `false` when the upgrade is not compatible.
#[wasm_bindgen(js_name = verifyCompatability)]
pub fn verify_compatability(a: String, b: String) -> Result<bool, String> {
    // service_compatible loads a completely before it reads b, and returns the
    // first error it finds. Check each source the same way and in the same
    // order, and stop at the first one that does not parse, type-check or
    // declare a service, so service_compatible still reports that error. The
    // import check runs before the type check, because a type that only the
    // imported file declares is unbound here.
    for source in [&a, &b] {
        let ast = match source.parse::<IDLProg>() {
            Ok(ast) => ast,
            Err(_) => break,
        };
        reject_service_imports(&ast)?;
        match check_prog(&mut TypeEnv::new(), &ast) {
            Ok(Some(_)) => {}
            _ => break,
        }
    }

    let a = candid_parser::utils::CandidSource::Text(&a);
    let b = candid_parser::utils::CandidSource::Text(&b);

    let res = candid_parser::utils::service_compatible(a, b);

    match res {
        Ok(_) => Ok(true),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize)]
struct CandidSchema {
    types: Vec<CandidTypeDeclaration>,
    service: Option<CandidServiceDeclaration>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CandidMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    docs: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    validation: Option<CandidValidationMetadata>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct CandidValidationMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    minimum: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    maximum: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_length: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_length: Option<CandidValidationBound>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pattern: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<CandidValidationFormat>,
}

#[derive(Clone, Serialize)]
struct CandidValidationBound {
    value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CandidValidationFormat {
    r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Serialize)]
struct CandidTypeDeclaration {
    name: String,
    #[serde(rename = "type")]
    ty: CandidType,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<CandidMetadata>,
}

#[derive(Serialize)]
struct CandidServiceDeclaration {
    methods: Vec<CandidMethodDeclaration>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<CandidMetadata>,
}

#[derive(Serialize)]
struct CandidMethodDeclaration {
    name: String,
    mode: &'static str,
    args: Vec<CandidType>,
    returns: Vec<CandidType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<CandidMetadata>,
}

#[derive(Serialize)]
struct CandidField {
    name: String,
    #[serde(rename = "type")]
    ty: CandidType,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<CandidMetadata>,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum CandidType {
    Null,
    Bool,
    Nat,
    Int,
    Nat8,
    Nat16,
    Nat32,
    Nat64,
    Int8,
    Int16,
    Int32,
    Int64,
    Float32,
    Float64,
    Text,
    Reserved,
    Empty,
    Principal,
    Blob,
    Reference {
        name: String,
    },
    Opt {
        #[serde(rename = "type")]
        ty: Box<CandidType>,
    },
    Vec {
        #[serde(rename = "type")]
        ty: Box<CandidType>,
    },
    Record {
        fields: Vec<CandidField>,
    },
    Variant {
        fields: Vec<CandidField>,
    },
    Tuple {
        types: Vec<CandidType>,
    },
    Func,
    Service,
    Class,
    Unknown,
    Knot,
    Future,
}

fn label_to_string(label: &candid_parser::candid::types::Label) -> String {
    match label {
        candid_parser::candid::types::Label::Id(id)
        | candid_parser::candid::types::Label::Unnamed(id) => format!("_{}_", id),
        candid_parser::candid::types::Label::Named(name) => name.clone(),
    }
}

fn metadata_from_docs(docs: &[String]) -> Option<CandidMetadata> {
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

fn normalize_doc_line(line: &str) -> String {
    line.trim()
        .strip_prefix('/')
        .map(str::trim)
        .unwrap_or_else(|| line.trim())
        .to_string()
}

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

fn apply_default_validation_messages(validation: &mut CandidValidationMetadata) {
    validation.minimum = with_default_bound_message(validation.minimum.take(), "minimum");
    validation.maximum = with_default_bound_message(validation.maximum.take(), "maximum");
    validation.min_length = with_default_bound_message(validation.min_length.take(), "minLength");
    validation.max_length = with_default_bound_message(validation.max_length.take(), "maxLength");
    validation.format = with_default_format_message(validation.format.take());
}

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

fn with_default_format_message(
    format: Option<CandidValidationFormat>,
) -> Option<CandidValidationFormat> {
    let mut format = format?;

    if format.message.is_none() {
        format.message = default_format_message(&format.r#type);
    }

    Some(format)
}

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

#[derive(Debug, Deserialize, Clone)]
struct MetadataRule {
    helper: Option<String>,
    regex: Option<String>,
    #[serde(rename = "jsonSchemaFormat")]
    json_schema_format: Option<String>,
    #[serde(rename = "contentEncoding")]
    content_encoding: Option<String>,
    #[serde(rename = "errorMessage")]
    error_message: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct ValidationBoundRule {
    template: String,
}

#[derive(Debug, Deserialize, Clone)]
struct MetadataRulesFile {
    #[serde(rename = "defaultValidationMessages")]
    default_validation_messages: HashMap<String, ValidationBoundRule>,
}

fn format_rules() -> HashMap<String, MetadataRule> {
    serde_json::from_str(include_str!("metadata-rules.json")).unwrap_or_default()
}

fn default_bound_rules() -> HashMap<String, ValidationBoundRule> {
    serde_json::from_str::<MetadataRulesFile>(include_str!("metadata-rules.json"))
        .map(|rules| rules.default_validation_messages)
        .unwrap_or_default()
}

fn default_format_message(format_type: &str) -> Option<String> {
    format_rules()
        .get(format_type)
        .and_then(|rule| rule.error_message.clone())
}

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
    })
}

fn syntax_field_for<'a>(
    fields: Option<&'a [TypeField]>,
    label: &candid_parser::candid::types::Label,
) -> Option<&'a TypeField> {
    fields?.iter().find(|field| field.label == *label)
}

fn type_to_schema(
    ty: &candid_parser::candid::types::Type,
    syntax_ty: Option<&IDLType>,
) -> CandidType {
    use candid_parser::candid::types::TypeInner;

    match ty.as_ref() {
        TypeInner::Null => CandidType::Null,
        TypeInner::Bool => CandidType::Bool,
        TypeInner::Nat => CandidType::Nat,
        TypeInner::Int => CandidType::Int,
        TypeInner::Nat8 => CandidType::Nat8,
        TypeInner::Nat16 => CandidType::Nat16,
        TypeInner::Nat32 => CandidType::Nat32,
        TypeInner::Nat64 => CandidType::Nat64,
        TypeInner::Int8 => CandidType::Int8,
        TypeInner::Int16 => CandidType::Int16,
        TypeInner::Int32 => CandidType::Int32,
        TypeInner::Int64 => CandidType::Int64,
        TypeInner::Float32 => CandidType::Float32,
        TypeInner::Float64 => CandidType::Float64,
        TypeInner::Text => CandidType::Text,
        TypeInner::Reserved => CandidType::Reserved,
        TypeInner::Empty => CandidType::Empty,
        TypeInner::Principal => CandidType::Principal,
        TypeInner::Var(name) => CandidType::Reference { name: name.clone() },
        TypeInner::Opt(inner) => CandidType::Opt {
            ty: Box::new(type_to_schema(
                inner,
                match syntax_ty {
                    Some(IDLType::OptT(inner)) => Some(inner),
                    _ => None,
                },
            )),
        },
        TypeInner::Vec(inner) => {
            if let TypeInner::Nat8 = inner.as_ref() {
                CandidType::Blob
            } else {
                CandidType::Vec {
                    ty: Box::new(type_to_schema(
                        inner,
                        match syntax_ty {
                            Some(IDLType::VecT(inner)) => Some(inner),
                            _ => None,
                        },
                    )),
                }
            }
        }
        TypeInner::Record(fields) => {
            let syntax_fields = match syntax_ty {
                Some(IDLType::RecordT(fields)) => Some(fields.as_slice()),
                _ => None,
            };
            let is_tuple = fields.iter().enumerate().all(|(idx, field)| {
                matches!(
                    *field.id,
                    candid_parser::candid::types::Label::Id(id)
                        | candid_parser::candid::types::Label::Unnamed(id)
                        if id == idx as u32
                )
            });

            if is_tuple && !fields.is_empty() {
                CandidType::Tuple {
                    types: fields
                        .iter()
                        .map(|field| {
                            let syntax_field = syntax_field_for(syntax_fields, &field.id);
                            type_to_schema(&field.ty, syntax_field.map(|field| &field.typ))
                        })
                        .collect(),
                }
            } else {
                CandidType::Record {
                    fields: fields
                        .iter()
                        .map(|field| CandidField {
                            name: label_to_string(&field.id),
                            ty: {
                                let syntax_field = syntax_field_for(syntax_fields, &field.id);
                                type_to_schema(&field.ty, syntax_field.map(|field| &field.typ))
                            },
                            metadata: syntax_field_for(syntax_fields, &field.id)
                                .and_then(|field| metadata_from_docs(&field.docs)),
                        })
                        .collect(),
                }
            }
        }
        TypeInner::Variant(fields) => {
            let syntax_fields = match syntax_ty {
                Some(IDLType::VariantT(fields)) => Some(fields.as_slice()),
                _ => None,
            };
            CandidType::Variant {
                fields: fields
                    .iter()
                    .map(|field| {
                        let syntax_field = syntax_field_for(syntax_fields, &field.id);
                        CandidField {
                            name: label_to_string(&field.id),
                            ty: type_to_schema(&field.ty, syntax_field.map(|field| &field.typ)),
                            metadata: syntax_field
                                .and_then(|field| metadata_from_docs(&field.docs)),
                        }
                    })
                    .collect(),
            }
        }
        TypeInner::Func(_) => CandidType::Func,
        TypeInner::Service(_) => CandidType::Service,
        TypeInner::Class(_, _) => CandidType::Class,
        TypeInner::Unknown => CandidType::Unknown,
        TypeInner::Knot(_) => CandidType::Knot,
        TypeInner::Future => CandidType::Future,
    }
}

fn type_bindings_by_name(ast: &IDLProg) -> HashMap<String, &Binding> {
    ast.decs
        .iter()
        .filter_map(|dec| match dec {
            Dec::TypD(binding) => Some((binding.id.clone(), binding)),
            Dec::ImportType(_) | Dec::ImportServ(_) => None,
        })
        .collect()
}

fn service_method_bindings_from_actor<'a>(
    actor: Option<&'a IDLActorType>,
    type_bindings: &HashMap<String, &'a Binding>,
) -> Vec<&'a Binding> {
    fn service_methods_from_type<'a>(
        ty: &'a IDLType,
        type_bindings: &HashMap<String, &'a Binding>,
    ) -> Vec<&'a Binding> {
        match ty {
            IDLType::ServT(methods) => methods.iter().collect(),
            IDLType::ClassT(_, inner) => service_methods_from_type(inner, type_bindings),
            IDLType::VarT(name) => type_bindings
                .get(name)
                .map(|binding| service_methods_from_type(&binding.typ, type_bindings))
                .unwrap_or_default(),
            _ => Vec::new(),
        }
    }

    actor
        .map(|actor| service_methods_from_type(&actor.typ, type_bindings))
        .unwrap_or_default()
}

fn syntax_func_for_method<'a>(
    binding: Option<&'a Binding>,
    type_bindings: &HashMap<String, &'a Binding>,
) -> Option<&'a candid_parser::syntax::FuncType> {
    let mut ty = &binding?.typ;
    // A method can name a func type (`greet : Greet`), possibly through more
    // aliases. `check_prog` has already rejected alias cycles.
    loop {
        match ty {
            IDLType::FuncT(func) => return Some(func),
            IDLType::VarT(name) => ty = &type_bindings.get(name).copied()?.typ,
            _ => return None,
        }
    }
}

#[wasm_bindgen(js_name = parseDid)]
pub fn parse_did(prog: String) -> Result<JsValue, String> {
    let ast = parse_prog(&prog)?;
    let mut env = TypeEnv::new();
    let actor = check_prog(&mut env, &ast).map_err(|e| e.to_string())?;
    let type_bindings = type_bindings_by_name(&ast);
    let method_bindings = service_method_bindings_from_actor(ast.actor.as_ref(), &type_bindings);

    // `check_prog` validates the actor but hands back its *declared* type: for
    // `service : S` that is `Var("S")`, for `service : (args) -> S` it is
    // `Class(args, Var("S"))`. Both are how real ledgers spell their service
    // (ICRC ledgers declare `service : (ledger_arg) -> Service`). Unwrap the
    // class and chase aliases through the environment until the service body
    // itself is in hand; anything else is not a service.
    let service_ty = actor.and_then(|mut ty| loop {
        ty = match ty.as_ref() {
            candid_parser::candid::types::TypeInner::Class(_, inner) => inner.clone(),
            candid_parser::candid::types::TypeInner::Var(_)
            | candid_parser::candid::types::TypeInner::Knot(_) => env.trace_type(&ty).ok()?,
            candid_parser::candid::types::TypeInner::Service(_) => break Some(ty),
            _ => break None,
        };
    });

    let types = env
        .0
        .iter()
        .map(|(name, ty)| {
            let binding = type_bindings.get(name).copied();
            CandidTypeDeclaration {
                name: name.clone(),
                ty: type_to_schema(ty, binding.map(|binding| &binding.typ)),
                metadata: binding.and_then(|binding| metadata_from_docs(&binding.docs)),
            }
        })
        .collect();

    let service = service_ty.and_then(|service_ty| {
        if let candid_parser::candid::types::TypeInner::Service(methods) = service_ty.as_ref() {
            let methods = methods
                .iter()
                .filter_map(|(name, ty)| {
                    // A method may name a func type instead of spelling out its
                    // signature, so resolve the alias before reading it.
                    if let Ok(func) = env.as_func(ty) {
                        let binding = method_bindings
                            .iter()
                            .find(|binding| binding.id == *name)
                            .copied();
                        let syntax_func = syntax_func_for_method(binding, &type_bindings);
                        // `composite_query` is its own mode, not an update: the IC
                        // rejects a replicated call to one. `didToJs` already emits
                        // the `composite_query` annotation for the same method.
                        let mode = if func
                            .modes
                            .contains(&candid_parser::candid::types::FuncMode::Oneway)
                        {
                            "oneway"
                        } else if func
                            .modes
                            .contains(&candid_parser::candid::types::FuncMode::CompositeQuery)
                        {
                            "composite_query"
                        } else if func
                            .modes
                            .contains(&candid_parser::candid::types::FuncMode::Query)
                        {
                            "query"
                        } else {
                            "update"
                        };

                        Some(CandidMethodDeclaration {
                            name: name.clone(),
                            mode,
                            args: func
                                .args
                                .iter()
                                .enumerate()
                                .map(|(index, arg)| {
                                    type_to_schema(
                                        arg,
                                        // candid_parser 0.4 wraps these in IDLArgType to carry
                                        // Candid's optional argument labels; the schema
                                        // builder wants the bare type.
                                        syntax_func
                                            .and_then(|func| func.args.get(index))
                                            .map(|arg| &arg.typ),
                                    )
                                })
                                .collect(),
                            returns: func
                                .rets
                                .iter()
                                .enumerate()
                                .map(|(index, ret)| {
                                    type_to_schema(
                                        ret,
                                        // candid_parser 0.4 wraps these in IDLArgType to carry
                                        // Candid's optional argument labels; the schema
                                        // builder wants the bare type.
                                        syntax_func
                                            .and_then(|func| func.rets.get(index))
                                            .map(|arg| &arg.typ),
                                    )
                                })
                                .collect(),
                            metadata: binding.and_then(|binding| metadata_from_docs(&binding.docs)),
                        })
                    } else {
                        None
                    }
                })
                .collect();

            Some(CandidServiceDeclaration {
                methods,
                metadata: ast
                    .actor
                    .as_ref()
                    .and_then(|actor| metadata_from_docs(&actor.docs)),
            })
        } else {
            None
        }
    });

    // serde_wasm_bindgen turns `None` into `undefined` unless told otherwise,
    // and the published type is `service: CandidServiceDeclaration | null`.
    // The optional metadata fields skip `None` entirely, so only `service`
    // changes.
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_missing_as_null(true);
    CandidSchema { types, service }
        .serialize(&serializer)
        .map_err(|e| e.to_string())
}
