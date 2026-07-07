//! Canonical language-neutral program IR for `cod`.
//!
//! # Architecture contract
//!
//! After Candid parsing and type checking, `ProgramIr` is the single structural
//! source of truth for the rest of the project.
//!
//! Only the Candid frontend/lowering layer may inspect `TypeEnv`, `Type`,
//! `TypeInner`, `IDLType`, or `IDLMergedProg` to discover program structure.
//! Runtime schemas, forms, workflows, devtools, framework tooling, and emitters
//! must consume `ProgramIr` instead of independently reinterpreting Candid.
//!
//! Candid Rust types may remain private to the codec for typed wire encoding and
//! decoding. The codec is an implementation detail, not a second structural model.
//!
//! The canonical IR must remain versioned, serializable, and language-neutral.
//! Never add TypeScript-, React-, TanStack-, form-widget-, or framework-specific
//! fields here. Wire truth and semantic conveniences such as blob, tuple, and
//! Result recognition must remain conceptually separate.
//!
//! Generated code is emitter output, never a source of truth. The TypeScript
//! emitter must ultimately consume only `ProgramIr` and must not walk the Candid
//! parser/type environment directly.

use std::collections::BTreeMap;

use anyhow::{anyhow, Context, Result};
use candid_parser::candid::types::{FuncMode, Label, Type, TypeEnv, TypeInner};
use candid_parser::syntax::{Binding, IDLArgType, IDLMergedProg, IDLType, PrimType, TypeField};
use ic_reactor_program_ir::{
    ActorIr, ArgIr, DeclId, FieldIr, FieldLabelIr, MetadataIr, MethodId, MethodIr, MethodModeIr,
    ProgramIr, TypeDeclIr, TypeId, TypeKindIr, TypeNodeIr, TypeRefIr, PROGRAM_IR_VERSION,
};

use crate::docs::{DocBlock, DocTag};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum PrimitiveKindIr {
    Null,
    Bool,
    Text,
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
    Principal,
    Reserved,
    Empty,
}

impl From<PrimitiveKindIr> for TypeKindIr {
    fn from(kind: PrimitiveKindIr) -> Self {
        match kind {
            PrimitiveKindIr::Null => Self::Null,
            PrimitiveKindIr::Bool => Self::Bool,
            PrimitiveKindIr::Text => Self::Text,
            PrimitiveKindIr::Nat => Self::Nat,
            PrimitiveKindIr::Int => Self::Int,
            PrimitiveKindIr::Nat8 => Self::Nat8,
            PrimitiveKindIr::Nat16 => Self::Nat16,
            PrimitiveKindIr::Nat32 => Self::Nat32,
            PrimitiveKindIr::Nat64 => Self::Nat64,
            PrimitiveKindIr::Int8 => Self::Int8,
            PrimitiveKindIr::Int16 => Self::Int16,
            PrimitiveKindIr::Int32 => Self::Int32,
            PrimitiveKindIr::Int64 => Self::Int64,
            PrimitiveKindIr::Float32 => Self::Float32,
            PrimitiveKindIr::Float64 => Self::Float64,
            PrimitiveKindIr::Principal => Self::Principal,
            PrimitiveKindIr::Reserved => Self::Reserved,
            PrimitiveKindIr::Empty => Self::Empty,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
struct ReservedTypeDeclIr {
    name: String,
    target: TypeDeclTarget,
    metadata: MetadataIr,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TypeDeclTarget {
    Pending,
    Lowering,
    Lowered(TypeId),
}

struct ArenaLoweringContext<'a> {
    _env: &'a TypeEnv,
    prog: &'a IDLMergedProg,
    types: Vec<TypeNodeIr>,
    declarations: Vec<ReservedTypeDeclIr>,
    methods: Vec<Option<MethodIr>>,
    declarations_by_name: BTreeMap<String, DeclId>,
    primitive_types: BTreeMap<PrimitiveKindIr, TypeId>,
}

impl<'a> ArenaLoweringContext<'a> {
    fn new(env: &'a TypeEnv, prog: &'a IDLMergedProg) -> Self {
        Self {
            _env: env,
            prog,
            types: Vec::new(),
            declarations: Vec::new(),
            methods: Vec::new(),
            declarations_by_name: BTreeMap::new(),
            primitive_types: BTreeMap::new(),
        }
    }

    fn reserve_declarations(&mut self) -> Result<()> {
        for binding in self.prog.bindings() {
            let index = u32::try_from(self.declarations.len())
                .context("ProgramIR declaration table exceeds u32")?;
            let id = DeclId(index);
            let previous = self.declarations_by_name.insert(binding.id.clone(), id);
            if previous.is_some() {
                return Err(anyhow!("duplicate Candid declaration `{}`", binding.id));
            }
            let metadata = metadata_from_docs(&binding.docs);
            self.declarations.push(ReservedTypeDeclIr {
                name: binding.id.clone(),
                target: TypeDeclTarget::Pending,
                metadata,
            });
        }

        Ok(())
    }

    fn lower_declaration_bodies(&mut self) -> Result<()> {
        for index in 0..self.declarations.len() {
            let id =
                DeclId(u32::try_from(index).context("ProgramIR declaration table exceeds u32")?);
            self.lower_declaration(id)?;
        }

        Ok(())
    }

    fn lower_declaration(&mut self, id: DeclId) -> Result<TypeId> {
        let index = id_index(id)?;
        match self
            .declarations
            .get(index)
            .with_context(|| format!("missing Candid declaration {id:?}"))?
            .target
        {
            TypeDeclTarget::Lowered(typ) => return Ok(typ),
            TypeDeclTarget::Lowering => {
                return Err(anyhow!(
                    "cyclic Candid type alias through declaration `{}`",
                    self.declarations[index].name
                ));
            }
            TypeDeclTarget::Pending => {}
        }

        self.declarations[index].target = TypeDeclTarget::Lowering;
        let name = self.declarations[index].name.clone();
        let syntax = self
            .prog
            .lookup(&name)
            .with_context(|| format!("missing Candid syntax for declaration `{name}`"))?
            .typ
            .clone();
        let typ = self.lower_declaration_type(&syntax)?;
        self.declarations[index].target = TypeDeclTarget::Lowered(typ);
        Ok(typ)
    }

    #[allow(dead_code)]
    fn declarations(&self) -> &[ReservedTypeDeclIr] {
        &self.declarations
    }

    #[allow(dead_code)]
    fn types(&self) -> &[TypeNodeIr] {
        &self.types
    }

    #[allow(dead_code)]
    fn type_node(&self, id: TypeId) -> Option<&TypeNodeIr> {
        self.types.get(usize::try_from(id.0).ok()?)
    }

    #[allow(dead_code)]
    fn methods(&self) -> Vec<&MethodIr> {
        self.methods
            .iter()
            .filter_map(|method| method.as_ref())
            .collect()
    }

    #[allow(dead_code)]
    fn method(&self, id: MethodId) -> Option<&MethodIr> {
        self.methods.get(usize::try_from(id.0).ok()?)?.as_ref()
    }

    #[allow(dead_code)]
    fn declaration_id(&self, name: &str) -> Option<DeclId> {
        self.declarations_by_name.get(name).copied()
    }

    #[allow(dead_code)]
    fn type_ref_from_syntax(&self, syntax: &IDLType, structural_id: TypeId) -> Result<TypeRefIr> {
        match syntax {
            IDLType::VarT(name) => self
                .declaration_id(name)
                .map(|id| TypeRefIr::Decl { id })
                .with_context(|| format!("unreserved Candid declaration `{name}`")),
            _ => Ok(TypeRefIr::Type { id: structural_id }),
        }
    }

    fn lower_declaration_type(&mut self, syntax: &IDLType) -> Result<TypeId> {
        match syntax {
            IDLType::VarT(name) => {
                let id = self
                    .declaration_id(name)
                    .with_context(|| format!("unreserved Candid declaration `{name}`"))?;
                self.lower_declaration(id)
            }
            _ => self.lower_type(syntax),
        }
    }

    #[allow(dead_code)]
    fn lower_type_ref(&mut self, syntax: &IDLType) -> Result<TypeRefIr> {
        match syntax {
            IDLType::VarT(name) => self
                .declaration_id(name)
                .map(|id| TypeRefIr::Decl { id })
                .with_context(|| format!("unreserved Candid declaration `{name}`")),
            _ => self.lower_type(syntax).map(|id| TypeRefIr::Type { id }),
        }
    }

    #[allow(dead_code)]
    fn lower_type(&mut self, syntax: &IDLType) -> Result<TypeId> {
        match syntax {
            IDLType::PrimT(kind) => self.lower_primitive_type(primitive_kind(kind)),
            IDLType::PrincipalT => self.lower_primitive_type(PrimitiveKindIr::Principal),
            IDLType::OptT(inner) => {
                let inner = self.lower_type_ref(inner)?;
                self.alloc_type(TypeKindIr::Opt { inner })
            }
            IDLType::VecT(inner) => {
                let inner = self.lower_type_ref(inner)?;
                self.alloc_type(TypeKindIr::Vec { inner })
            }
            IDLType::RecordT(fields) => {
                let fields = self.lower_fields(fields)?;
                self.alloc_type(TypeKindIr::Record { fields })
            }
            IDLType::VariantT(fields) => {
                let fields = self.lower_fields(fields)?;
                self.alloc_type(TypeKindIr::Variant { fields })
            }
            IDLType::FuncT(func) => {
                let args = self.lower_args(&func.args)?;
                let returns = self.lower_args(&func.rets)?;
                self.alloc_type(TypeKindIr::Func {
                    args,
                    returns,
                    mode: method_mode(&func.modes),
                })
            }
            IDLType::ServT(methods) => {
                let methods = methods
                    .iter()
                    .map(|method| self.lower_method_id(method))
                    .collect::<Result<Vec<_>>>()?;
                self.alloc_type(TypeKindIr::Service { methods })
            }
            IDLType::ClassT(_, inner) => self.lower_type(inner),
            IDLType::VarT(name) => Err(anyhow!(
                "expected structural type syntax, got declaration reference `{name}`"
            )),
        }
    }

    fn lower_primitive_type(&mut self, kind: PrimitiveKindIr) -> Result<TypeId> {
        if let Some(id) = self.primitive_types.get(&kind) {
            return Ok(*id);
        }

        let id = self.alloc_type(TypeKindIr::from(kind))?;
        self.primitive_types.insert(kind, id);
        Ok(id)
    }

    fn lower_fields(&mut self, fields: &[TypeField]) -> Result<Vec<FieldIr>> {
        fields
            .iter()
            .map(|field| {
                let typ = self.lower_type_ref(&field.typ)?;
                let docs = doc_meta(&field.docs);
                Ok(FieldIr {
                    label: field_label_ir_from_label(&field.label),
                    typ,
                    metadata: MetadataIr {
                        docs: docs.docs,
                        raw_docs: docs.raw_docs,
                        doc_tags: docs.tags,
                    },
                })
            })
            .collect()
    }

    fn lower_args(&mut self, args: &[IDLArgType]) -> Result<Vec<ArgIr>> {
        args.iter().map(|arg| self.lower_arg(arg)).collect()
    }

    fn lower_arg(&mut self, arg: &IDLArgType) -> Result<ArgIr> {
        Ok(ArgIr {
            name: arg.name.clone(),
            typ: self.lower_type_ref(&arg.typ)?,
            metadata: MetadataIr::default(),
        })
    }

    fn lower_method_id(&mut self, method: &Binding) -> Result<MethodId> {
        let IDLType::FuncT(func) = &method.typ else {
            return Err(anyhow!("method `{}` is not a function", method.id));
        };
        let id = self.reserve_method_id()?;
        let lowered = MethodIr {
            name: method.id.clone(),
            mode: method_mode(&func.modes),
            args: self.lower_args(&func.args)?,
            returns: self.lower_args(&func.rets)?,
            metadata: metadata_from_docs(&method.docs),
        };
        self.set_method(id, lowered)?;
        Ok(id)
    }

    fn lower_actor(&mut self, actor: Option<&Type>) -> Result<Option<ActorIr>> {
        let Some(actor) = actor else {
            return Ok(None);
        };

        let syntax_actor = self
            .prog
            .resolve_actor()
            .context("failed to resolve actor syntax")?
            .context("checked actor exists but source actor syntax is absent")?;

        let (init_args, service_syntax) = match &syntax_actor.typ {
            IDLType::ClassT(args, inner) => (self.lower_args(args)?, inner.as_ref()),
            service => (Vec::new(), service),
        };

        let service = match service_syntax {
            IDLType::VarT(name) => {
                let decl_id = self
                    .declaration_id(name)
                    .with_context(|| format!("unreserved actor service declaration `{name}`"))?;
                self.lower_declaration(decl_id)?
            }
            IDLType::ServT(_) => self.lower_type(service_syntax)?,
            other => {
                if matches!(
                    self._env.trace_type(actor)?.as_ref(),
                    TypeInner::Service(_) | TypeInner::Class(_, _)
                ) {
                    self.lower_type(other)?
                } else {
                    return Err(anyhow!(
                        "expected service or service class actor, got {other:?}"
                    ));
                }
            }
        };

        Ok(Some(ActorIr { init_args, service }))
    }

    fn alloc_type(&mut self, kind: TypeKindIr) -> Result<TypeId> {
        let index = u32::try_from(self.types.len()).context("ProgramIR type arena exceeds u32")?;
        let id = TypeId(index);
        self.types.push(TypeNodeIr { kind });
        Ok(id)
    }

    fn reserve_method_id(&mut self) -> Result<MethodId> {
        let index =
            u32::try_from(self.methods.len()).context("ProgramIR method table exceeds u32")?;
        let id = MethodId(index);
        self.methods.push(None);
        Ok(id)
    }

    fn set_method(&mut self, id: MethodId, method: MethodIr) -> Result<()> {
        let slot = self
            .methods
            .get_mut(usize::try_from(id.0).context("ProgramIR method ID does not fit usize")?)
            .with_context(|| format!("missing reserved ProgramIR method slot {id:?}"))?;
        if slot.is_some() {
            return Err(anyhow!("ProgramIR method slot {id:?} was already lowered"));
        }
        *slot = Some(method);
        Ok(())
    }

    fn finish(self, actor: Option<ActorIr>) -> Result<ProgramIr> {
        let declarations = self
            .declarations
            .into_iter()
            .map(|decl| {
                let TypeDeclTarget::Lowered(typ) = decl.target else {
                    return Err(anyhow!(
                        "Candid declaration `{}` was not lowered",
                        decl.name
                    ));
                };
                Ok(TypeDeclIr {
                    name: decl.name,
                    typ,
                    metadata: decl.metadata,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let methods = self
            .methods
            .into_iter()
            .enumerate()
            .map(|(index, method)| {
                method.with_context(|| {
                    format!("ProgramIR method slot {index} was reserved but not lowered")
                })
            })
            .collect::<Result<Vec<_>>>()?;

        let program = ProgramIr {
            version: PROGRAM_IR_VERSION,
            types: self.types,
            declarations,
            methods,
            actor,
        };
        program
            .validate()
            .context("lowered invalid ProgramIR graph")?;
        Ok(program)
    }
}

pub fn program_ir(env: &TypeEnv, actor: &Type, prog: &IDLMergedProg) -> Result<ProgramIr> {
    program_ir_from_parts(env, Some(actor), prog)
}

pub fn program_ir_from_parts(
    env: &TypeEnv,
    actor: Option<&Type>,
    prog: &IDLMergedProg,
) -> Result<ProgramIr> {
    let mut arena_lowerer = ArenaLoweringContext::new(env, prog);
    arena_lowerer.reserve_declarations()?;
    arena_lowerer.lower_declaration_bodies()?;
    let actor = arena_lowerer.lower_actor(actor)?;
    arena_lowerer.finish(actor)
}

fn method_mode(modes: &[FuncMode]) -> MethodModeIr {
    if modes.iter().any(|mode| matches!(mode, FuncMode::Oneway)) {
        MethodModeIr::Oneway
    } else if modes
        .iter()
        .any(|mode| matches!(mode, FuncMode::CompositeQuery))
    {
        MethodModeIr::CompositeQuery
    } else if modes.iter().any(|mode| matches!(mode, FuncMode::Query)) {
        MethodModeIr::Query
    } else {
        MethodModeIr::Update
    }
}

#[derive(Debug, Clone, Default)]
struct DocMeta {
    docs: Vec<String>,
    raw_docs: Vec<String>,
    tags: Vec<DocTag>,
}

fn doc_meta(lines: &[String]) -> DocMeta {
    let block = DocBlock::parse(lines);
    if block.is_empty() {
        DocMeta::default()
    } else {
        DocMeta {
            docs: block
                .lines
                .iter()
                .filter(|line| !line.trim_start().starts_with('@'))
                .cloned()
                .collect(),
            raw_docs: block.lines,
            tags: block.tags,
        }
    }
}

fn metadata_from_docs(lines: &[String]) -> MetadataIr {
    let docs = doc_meta(lines);
    MetadataIr {
        docs: docs.docs,
        raw_docs: docs.raw_docs,
        doc_tags: docs.tags,
    }
}

#[cfg(test)]
fn actor_service_syntax(prog: &IDLMergedProg) -> Option<Vec<Binding>> {
    match prog.resolve_actor().ok().flatten()?.typ {
        IDLType::ServT(methods) => Some(methods),
        IDLType::ClassT(_, inner) => match *inner {
            IDLType::ServT(methods) => Some(methods),
            _ => None,
        },
        _ => None,
    }
}

fn primitive_kind(kind: &PrimType) -> PrimitiveKindIr {
    match kind {
        PrimType::Null => PrimitiveKindIr::Null,
        PrimType::Bool => PrimitiveKindIr::Bool,
        PrimType::Text => PrimitiveKindIr::Text,
        PrimType::Nat => PrimitiveKindIr::Nat,
        PrimType::Int => PrimitiveKindIr::Int,
        PrimType::Nat8 => PrimitiveKindIr::Nat8,
        PrimType::Nat16 => PrimitiveKindIr::Nat16,
        PrimType::Nat32 => PrimitiveKindIr::Nat32,
        PrimType::Nat64 => PrimitiveKindIr::Nat64,
        PrimType::Int8 => PrimitiveKindIr::Int8,
        PrimType::Int16 => PrimitiveKindIr::Int16,
        PrimType::Int32 => PrimitiveKindIr::Int32,
        PrimType::Int64 => PrimitiveKindIr::Int64,
        PrimType::Float32 => PrimitiveKindIr::Float32,
        PrimType::Float64 => PrimitiveKindIr::Float64,
        PrimType::Reserved => PrimitiveKindIr::Reserved,
        PrimType::Empty => PrimitiveKindIr::Empty,
    }
}

fn field_label_ir_from_label(label: &Label) -> FieldLabelIr {
    let candid_id = label.get_id();
    match label {
        Label::Named(name) => FieldLabelIr::Named { name: name.clone() },
        Label::Id(_) => FieldLabelIr::Id { candid_id },
        Label::Unnamed(_) => FieldLabelIr::Unnamed { candid_id },
    }
}

fn id_index(id: DeclId) -> Result<usize> {
    usize::try_from(id.0).context("ProgramIR declaration ID does not fit usize")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_candid_source;

    #[test]
    fn emits_named_refs_and_docs() {
        let parsed = parse_candid_source(
            r#"
// Account docs.
type Account = record {
  // Owner docs.
  owner : principal;
  subaccount : opt blob;
};

service : {
  // Balance docs.
  icrc1_balance_of : (Account) -> (nat) query;
}
"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();

        let account = declaration(&ir, "Account");
        let account_id = declaration_id(&ir, "Account");
        assert_eq!(account.metadata.docs, vec!["Account docs."]);

        let balance = find_method(actor_methods(&ir), "icrc1_balance_of");
        assert_eq!(balance.mode, MethodModeIr::Query);
        assert_eq!(balance.metadata.docs, vec!["Balance docs."]);
        assert_eq!(balance.args[0].typ, TypeRefIr::Decl { id: account_id });
    }

    #[test]
    fn emits_doc_tags_for_declarations_methods_and_fields() {
        let parsed = parse_candid_source(
            r#"
/// Contact docs.
/// @strict
type Contact = record {
  // Email docs.
  // @format email Invalid email
  email : text;

  /// Phone docs.
  /// @format phone-number Must be valid
  phone : text;
};

service : {
  // Save docs.
  // @minimum 1 Method metadata survives too
  save : (Contact) -> ();
}
"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();
        println!("{}", serde_json::to_string_pretty(&ir).unwrap());

        let contact = declaration(&ir, "Contact");
        assert_eq!(contact.metadata.docs, vec!["Contact docs."]);
        assert_eq!(contact.metadata.raw_docs, vec!["Contact docs.", "@strict"]);
        assert_eq!(contact.metadata.doc_tags[0].name, "strict");
        assert_eq!(contact.metadata.doc_tags[0].value, "");

        let fields = declaration_record_fields(&ir, contact);
        let email = fields.iter().find(|field| named(field, "email")).unwrap();
        assert_eq!(email.metadata.docs, vec!["Email docs."]);
        assert_eq!(
            email.metadata.raw_docs,
            vec!["Email docs.", "@format email Invalid email"]
        );
        assert_eq!(email.metadata.doc_tags[0].name, "format");
        assert_eq!(email.metadata.doc_tags[0].value, "email Invalid email");

        let phone = fields.iter().find(|field| named(field, "phone")).unwrap();
        assert_eq!(phone.metadata.docs, vec!["Phone docs."]);
        assert_eq!(phone.metadata.doc_tags[0].name, "format");
        assert_eq!(
            phone.metadata.doc_tags[0].value,
            "phone-number Must be valid"
        );

        let method = find_method(actor_methods(&ir), "save");
        assert_eq!(method.metadata.docs, vec!["Save docs."]);
        assert_eq!(method.metadata.doc_tags[0].name, "minimum");
        assert_eq!(
            method.metadata.doc_tags[0].value,
            "1 Method metadata survives too"
        );
    }

    #[test]
    fn preserves_program_version_and_actor_init_args() {
        let parsed = parse_candid_source(
            r#"
service : (text, opt principal) -> {
  greet : (text) -> (text) query;
}
"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();

        assert_eq!(ir.version, PROGRAM_IR_VERSION);
        let actor = ir.actor.as_ref().unwrap();
        assert_eq!(actor.init_args.len(), 2);
        let methods = service_methods(&ir, actor.service);
        assert_eq!(methods.len(), 1);
        assert_eq!(methods[0].mode, MethodModeIr::Query);
    }

    #[test]
    fn service_nodes_reference_method_arena_ids() {
        let parsed = parse_candid_source(
            r#"
service : {
  balance : () -> (nat) query;
  transfer : (nat) -> ();
}
"#,
        )
        .unwrap();
        let ir = program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog).unwrap();
        let graph = ir.graph().unwrap();
        let actor = ir.actor.as_ref().unwrap();

        assert_eq!(
            graph.service_method_ids(actor.service).unwrap(),
            &[MethodId(0), MethodId(1)]
        );
        assert_eq!(graph.method(MethodId(0)).unwrap().name, "balance");
        assert_eq!(graph.method(MethodId(1)).unwrap().name, "transfer");
        assert_eq!(
            actor_methods(&ir)
                .into_iter()
                .map(|method| method.name)
                .collect::<Vec<_>>(),
            vec!["balance", "transfer"]
        );
    }

    #[test]
    fn same_method_name_in_distinct_services_has_distinct_method_ids() {
        let parsed = parse_candid_source(
            r#"
type Ledger = service {
  get : () -> (nat) query;
};

type Profile = service {
  get : () -> (text) query;
};
"#,
        )
        .unwrap();
        let ir = program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog).unwrap();
        let graph = ir.graph().unwrap();
        let ledger = declaration(&ir, "Ledger");
        let profile = declaration(&ir, "Profile");

        assert_eq!(ir.methods.len(), 2);
        assert_eq!(
            graph.service_method_ids(ledger.typ).unwrap(),
            &[MethodId(0)]
        );
        assert_eq!(
            graph.service_method_ids(profile.typ).unwrap(),
            &[MethodId(1)]
        );
        assert_eq!(graph.method(MethodId(0)).unwrap().name, "get");
        assert_eq!(graph.method(MethodId(1)).unwrap().name, "get");
        assert_ne!(
            graph.method(MethodId(0)).unwrap().returns,
            graph.method(MethodId(1)).unwrap().returns
        );
    }

    #[test]
    fn preserves_absent_actor_as_none() {
        let parsed = parse_candid_source(
            r#"
type User = record {
  name : text;
};
"#,
        )
        .unwrap();
        let ir = program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog).unwrap();

        assert!(parsed.actor.is_none());
        assert!(ir.actor.is_none());
        assert!(ir.declarations.iter().any(|decl| decl.name == "User"));
        let json = serde_json::to_value(&ir).unwrap();
        assert!(json.get("actor").unwrap().is_null());
    }

    #[test]
    fn preserves_empty_actor_as_present_actor() {
        let parsed = parse_candid_source("service : {}").unwrap();
        let ir = program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog).unwrap();

        let actor = ir.actor.as_ref().expect("empty service is still an actor");
        assert!(actor.init_args.is_empty());
        assert!(service_methods(&ir, actor.service).is_empty());
    }

    #[test]
    fn preserves_all_method_modes() {
        let parsed = parse_candid_source(
            r#"
service : {
  read : () -> (text) query;
  stream : () -> (text) composite_query;
  write : (text) -> ();
  notify : (text) -> () oneway;
}
"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();

        assert_eq!(method_mode(&ir, "read"), MethodModeIr::Query);
        assert_eq!(method_mode(&ir, "stream"), MethodModeIr::CompositeQuery);
        assert_eq!(method_mode(&ir, "write"), MethodModeIr::Update);
        assert_eq!(method_mode(&ir, "notify"), MethodModeIr::Oneway);
    }

    #[test]
    fn json_round_trips_and_preserves_field_labels() {
        let parsed = parse_candid_source(
            r#"
type Fields = record {
  text;
  named : text;
  10 : nat;
};

service : { get : () -> (Fields) query; }
"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();

        let json = serde_json::to_string(&ir).unwrap();
        let round_trip: ProgramIr = serde_json::from_str(&json).unwrap();
        assert_eq!(round_trip, ir);

        let fields_decl = declaration(&round_trip, "Fields");
        let fields = declaration_record_fields(&round_trip, fields_decl);
        assert!(fields
            .iter()
            .any(|field| matches!(&field.label, FieldLabelIr::Named { name } if name == "named")));
        assert!(fields
            .iter()
            .any(|field| matches!(&field.label, FieldLabelIr::Id { candid_id: 10 })));
        assert!(fields
            .iter()
            .any(|field| matches!(&field.label, FieldLabelIr::Unnamed { candid_id: 0 })));
    }

    #[test]
    fn recursive_types_are_represented_as_refs() {
        let parsed = parse_candid_source(
            r#"
type List = opt record {
  head : nat;
  tail : List;
};

service : {
  get : () -> (List) query;
}"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();
        println!("{}", serde_json::to_string_pretty(&ir).unwrap());
        let list_decl = declaration(&ir, "List");
        let list_decl_id = declaration_id(&ir, "List");
        let TypeKindIr::Opt { inner } = &declaration_type_node(&ir, list_decl).kind else {
            panic!("expected List to lower to opt");
        };
        let TypeRefIr::Type { id: record_id } = inner else {
            panic!("expected List opt inner to be an anonymous record type");
        };
        let tail = find_field(record_fields(type_node(&ir, *record_id)), "tail");
        assert_eq!(tail.typ, TypeRefIr::Decl { id: list_decl_id });
    }

    #[test]
    fn recursive_service_types_are_represented_as_refs() {
        let parsed = parse_candid_source(
            r#"
type Node = record {
  value : text;
  children : vec Node;
};

service : {
  root : () -> (Node) query;
  save : (Node) -> ();
}"#,
        )
        .unwrap();
        let actor = parsed.actor.as_ref().unwrap();
        let ir = program_ir(&parsed.env, actor, &parsed.prog).unwrap();
        println!("{}", serde_json::to_string_pretty(&ir).unwrap());
        let node_decl = declaration(&ir, "Node");
        let node_decl_id = declaration_id(&ir, "Node");
        let children = find_field(declaration_record_fields(&ir, node_decl), "children");
        let TypeRefIr::Type { id: vec_id } = children.typ else {
            panic!("expected children to reference a vec type node");
        };
        let TypeKindIr::Vec { inner } = &type_node(&ir, vec_id).kind else {
            panic!("expected children type node to be vec");
        };
        assert_eq!(*inner, TypeRefIr::Decl { id: node_decl_id });
    }

    mod type_arena_syntax_verification {
        use super::*;
        use candid_parser::syntax::PrimType;

        #[test]
        fn syntax_distinguishes_direct_type_and_declaration_reference() {
            let parsed = parse_candid_source(
                r#"
type UserId = nat64;

service : {
  direct : (nat64) -> ();
  named : (UserId) -> ();
}
"#,
            )
            .unwrap();
            let methods = actor_service_syntax(&parsed.prog).unwrap();
            let direct = find_method(&methods, "direct");
            let named = find_method(&methods, "named");
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();

            assert!(matches!(
                first_arg_type(direct),
                IDLType::PrimT(PrimType::Nat64)
            ));
            assert!(matches!(
                first_arg_type(named),
                IDLType::VarT(name) if name == "UserId"
            ));
            assert_eq!(
                context
                    .type_ref_from_syntax(first_arg_type(direct), TypeId(7))
                    .unwrap(),
                TypeRefIr::Type { id: TypeId(7) }
            );
            assert_eq!(
                context
                    .type_ref_from_syntax(first_arg_type(named), TypeId(7))
                    .unwrap(),
                TypeRefIr::Decl { id: DeclId(0) }
            );
        }

        #[test]
        fn recursive_type_use_is_source_declaration_reference() {
            let parsed = parse_candid_source(
                r#"
type List = opt record {
  head : nat;
  tail : List;
};
"#,
            )
            .unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();
            let list = parsed.prog.lookup("List").unwrap();
            let IDLType::OptT(inner) = &list.typ else {
                panic!("expected List to be opt, got {:?}", list.typ);
            };
            let IDLType::RecordT(fields) = inner.as_ref() else {
                panic!("expected List inner to be record, got {inner:?}");
            };
            let tail = fields
                .iter()
                .find(|field| matches!(&field.label, Label::Named(name) if name == "tail"))
                .expect("missing tail field");

            assert!(matches!(&tail.typ, IDLType::VarT(name) if name == "List"));
            assert_eq!(
                context.type_ref_from_syntax(&tail.typ, TypeId(99)).unwrap(),
                TypeRefIr::Decl { id: DeclId(0) }
            );
        }

        #[test]
        fn mutual_recursion_decl_refs_are_available_before_body_lowering() {
            let parsed = parse_candid_source(
                r#"
type A = record {
  b : opt B;
};

type B = record {
  a : opt A;
};
"#,
            )
            .unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();

            let a = parsed.prog.lookup("A").unwrap();
            let b = parsed.prog.lookup("B").unwrap();
            let a_b_inner = opt_field_inner(a, "b");
            let b_a_inner = opt_field_inner(b, "a");

            assert_eq!(
                context.type_ref_from_syntax(a_b_inner, TypeId(99)).unwrap(),
                TypeRefIr::Decl { id: DeclId(1) }
            );
            assert_eq!(
                context.type_ref_from_syntax(b_a_inner, TypeId(99)).unwrap(),
                TypeRefIr::Decl { id: DeclId(0) }
            );
        }

        #[test]
        fn named_service_actor_preserves_actor_declaration_reference() {
            let parsed = parse_candid_source(
                r#"
type Backend = service {
  get : () -> (text) query;
};

service : Backend;
"#,
            )
            .unwrap();
            let backend = parsed.prog.lookup("Backend").unwrap();
            let actor = parsed.prog.resolve_actor().unwrap().unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();

            assert!(matches!(&backend.typ, IDLType::ServT(methods) if methods.len() == 1));
            assert!(matches!(&actor.typ, IDLType::VarT(name) if name == "Backend"));
            assert_eq!(
                context
                    .type_ref_from_syntax(&actor.typ, TypeId(99))
                    .unwrap(),
                TypeRefIr::Decl { id: DeclId(0) }
            );
        }

        #[test]
        fn source_order_declaration_reservation_is_deterministic() {
            let source = r#"
type Zed = nat;
type Alpha = text;
type Middle = bool;
"#;

            let reservations = reserve_source_order_decl_ids(source);
            assert_eq!(
                reservations,
                vec![
                    (DeclId(0), "Zed".to_string()),
                    (DeclId(1), "Alpha".to_string()),
                    (DeclId(2), "Middle".to_string()),
                ]
            );

            for _ in 0..3 {
                assert_eq!(reserve_source_order_decl_ids(source), reservations);
            }

            assert_eq!(
                env_sorted_declaration_order(source),
                vec!["Alpha".to_string(), "Middle".to_string(), "Zed".to_string()]
            );
        }

        #[test]
        fn current_program_ir_json_is_deterministic_across_compiles() {
            let source = r#"
type Zed = nat;
type Alpha = record {
  id : Zed;
};

service : {
  get : (Alpha) -> (Zed) query;
}
"#;

            let first = program_ir_json(source);
            for _ in 0..3 {
                assert_eq!(program_ir_json(source), first);
            }
        }

        fn find_method<'a>(methods: &'a [Binding], name: &str) -> &'a Binding {
            methods
                .iter()
                .find(|method| method.id == name)
                .unwrap_or_else(|| panic!("missing method {name}"))
        }

        fn first_arg_type(method: &Binding) -> &IDLType {
            let IDLType::FuncT(func) = &method.typ else {
                panic!("expected method function type, got {:?}", method.typ);
            };
            &func.args.first().expect("missing first argument").typ
        }

        fn opt_field_inner<'a>(binding: &'a Binding, field_name: &str) -> &'a IDLType {
            let IDLType::RecordT(fields) = &binding.typ else {
                panic!(
                    "expected record type for {}, got {:?}",
                    binding.id, binding.typ
                );
            };
            let field = fields
                .iter()
                .find(|field| matches!(&field.label, Label::Named(name) if name == field_name))
                .unwrap_or_else(|| panic!("missing field {field_name}"));
            let IDLType::OptT(inner) = &field.typ else {
                panic!("expected opt field {field_name}, got {:?}", field.typ);
            };

            inner
        }

        fn reserve_source_order_decl_ids(source: &str) -> Vec<(DeclId, String)> {
            let parsed = parse_candid_source(source).unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();
            context
                .declarations()
                .iter()
                .enumerate()
                .map(|(index, decl)| {
                    (
                        DeclId(u32::try_from(index).expect("fixture declaration index fits u32")),
                        decl.name.clone(),
                    )
                })
                .collect()
        }

        fn env_sorted_declaration_order(source: &str) -> Vec<String> {
            let parsed = parse_candid_source(source).unwrap();
            parsed
                .env
                .to_sorted_iter()
                .map(|(name, _)| name.to_string())
                .collect()
        }

        fn program_ir_json(source: &str) -> String {
            let parsed = parse_candid_source(source).unwrap();
            let ir =
                program_ir_from_parts(&parsed.env, parsed.actor.as_ref(), &parsed.prog).unwrap();
            serde_json::to_string(&ir).unwrap()
        }
    }

    mod type_arena_allocation_verification {
        use super::*;

        #[test]
        fn primitive_type_allocation_reuses_type_ids() {
            let parsed = parse_candid_source(
                r#"
type UserId = nat64;
type TransactionId = nat64;
"#,
            )
            .unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();

            let user_id = context
                .lower_type(&parsed.prog.lookup("UserId").unwrap().typ)
                .unwrap();
            let transaction_id = context
                .lower_type(&parsed.prog.lookup("TransactionId").unwrap().typ)
                .unwrap();

            assert_eq!(user_id, TypeId(0));
            assert_eq!(transaction_id, TypeId(0));
            assert_eq!(
                context.types(),
                &[TypeNodeIr {
                    kind: TypeKindIr::Nat64,
                }]
            );
        }

        #[test]
        fn repeated_anonymous_composites_allocate_distinct_type_ids() {
            let parsed = parse_candid_source(
                r#"
service : {
  a : (record { value : text }) -> ();
  b : (record { value : text }) -> ();
}
"#,
            )
            .unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();
            let methods = actor_service_syntax(&parsed.prog).unwrap();
            let a = first_arg_type(find_method(&methods, "a"));
            let b = first_arg_type(find_method(&methods, "b"));

            let a_ref = context.lower_type_ref(a).unwrap();
            let b_ref = context.lower_type_ref(b).unwrap();

            assert_eq!(a_ref, TypeRefIr::Type { id: TypeId(1) });
            assert_eq!(b_ref, TypeRefIr::Type { id: TypeId(2) });
            assert_ne!(a_ref, b_ref);
            assert_eq!(context.types().len(), 3);
            assert_eq!(context.type_node(TypeId(0)).unwrap().kind, TypeKindIr::Text);
            assert_eq!(
                record_field(context.type_node(TypeId(1)).unwrap(), "value").typ,
                TypeRefIr::Type { id: TypeId(0) }
            );
            assert_eq!(
                record_field(context.type_node(TypeId(2)).unwrap(), "value").typ,
                TypeRefIr::Type { id: TypeId(0) }
            );
            assert_eq!(
                context.type_node(TypeId(1)).unwrap(),
                context.type_node(TypeId(2)).unwrap()
            );
        }

        #[test]
        fn composite_allocation_preserves_named_declaration_refs() {
            let parsed = parse_candid_source(
                r#"
type UserId = nat64;
type Profile = record {
  id : UserId;
  aliases : vec text;
};
"#,
            )
            .unwrap();
            let mut context = ArenaLoweringContext::new(&parsed.env, &parsed.prog);
            context.reserve_declarations().unwrap();

            let profile = context
                .lower_type(&parsed.prog.lookup("Profile").unwrap().typ)
                .unwrap();
            let fields = record_fields(context.type_node(profile).unwrap());
            let id = find_field(fields, "id");
            let aliases = find_field(fields, "aliases");

            assert_eq!(profile, TypeId(2));
            assert_eq!(id.typ, TypeRefIr::Decl { id: DeclId(0) });
            assert_eq!(aliases.typ, TypeRefIr::Type { id: TypeId(1) });
            assert_eq!(context.type_node(TypeId(0)).unwrap().kind, TypeKindIr::Text);
            assert_eq!(
                context.type_node(TypeId(1)).unwrap().kind,
                TypeKindIr::Vec {
                    inner: TypeRefIr::Type { id: TypeId(0) },
                }
            );
        }

        fn find_method<'a>(methods: &'a [Binding], name: &str) -> &'a Binding {
            methods
                .iter()
                .find(|method| method.id == name)
                .unwrap_or_else(|| panic!("missing method {name}"))
        }

        fn first_arg_type(method: &Binding) -> &IDLType {
            let IDLType::FuncT(func) = &method.typ else {
                panic!("expected method function type, got {:?}", method.typ);
            };
            &func.args.first().expect("missing first argument").typ
        }

        fn record_field<'a>(node: &'a TypeNodeIr, name: &str) -> &'a FieldIr {
            find_field(record_fields(node), name)
        }

        fn record_fields(node: &TypeNodeIr) -> &[FieldIr] {
            match &node.kind {
                TypeKindIr::Record { fields } => fields,
                other => panic!("expected record node, got {other:?}"),
            }
        }

        fn find_field<'a>(fields: &'a [FieldIr], name: &str) -> &'a FieldIr {
            fields
                .iter()
                .find(|field| matches!(&field.label, FieldLabelIr::Named { name: field_name } if field_name == name))
                .unwrap_or_else(|| panic!("missing field {name}"))
        }
    }

    mod type_arena_conceptual_fixtures {
        use super::*;

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct ConceptualProgram {
            declarations: Vec<ConceptualDecl>,
            types: Vec<ConceptualType>,
            actor: Option<ConceptualActor>,
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct ConceptualDecl {
            name: &'static str,
            typ: TypeId,
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct ConceptualActor {
            init_args: Vec<TypeRefIr>,
            service: TypeId,
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        enum ConceptualType {
            Nat,
            Nat64,
            Text,
            Opt(TypeRefIr),
            Record(Vec<ConceptualField>),
            Service(Vec<ConceptualMethod>),
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct ConceptualField {
            label: &'static str,
            typ: TypeRefIr,
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct ConceptualMethod {
            name: &'static str,
            mode: MethodModeIr,
            args: Vec<TypeRefIr>,
            returns: Vec<TypeRefIr>,
        }

        impl ConceptualProgram {
            fn decl(&self, id: DeclId) -> &ConceptualDecl {
                self.declarations
                    .get(id_index(id.0))
                    .unwrap_or_else(|| panic!("missing declaration {id:?}"))
            }

            fn decl_id_by_name(&self, name: &str) -> Option<DeclId> {
                self.declarations
                    .iter()
                    .position(|declaration| declaration.name == name)
                    .map(|index| {
                        DeclId(u32::try_from(index).expect("fixture declaration index fits u32"))
                    })
            }

            fn type_node(&self, id: TypeId) -> &ConceptualType {
                self.types
                    .get(id_index(id.0))
                    .unwrap_or_else(|| panic!("missing type {id:?}"))
            }

            fn resolve(&self, reference: TypeRefIr) -> TypeId {
                match reference {
                    TypeRefIr::Type { id } => id,
                    TypeRefIr::Decl { id } => self.decl(id).typ,
                }
            }
        }

        #[test]
        fn declaration_identity() {
            let program = ConceptualProgram {
                declarations: vec![
                    ConceptualDecl {
                        name: "UserId",
                        typ: TypeId(0),
                    },
                    ConceptualDecl {
                        name: "TransactionId",
                        typ: TypeId(0),
                    },
                ],
                types: vec![ConceptualType::Nat64],
                actor: None,
            };

            assert!(program.actor.is_none());
            assert_ne!(DeclId(0), DeclId(1));
            assert_eq!(program.decl(DeclId(0)).name, "UserId");
            assert_eq!(program.decl(DeclId(1)).name, "TransactionId");
            assert_eq!(program.decl_id_by_name("UserId"), Some(DeclId(0)));
            assert_eq!(program.decl_id_by_name("TransactionId"), Some(DeclId(1)));
            assert_eq!(program.resolve(decl_ref(0)), TypeId(0));
            assert_eq!(program.resolve(decl_ref(1)), TypeId(0));
            assert_eq!(program.type_node(TypeId(0)), &ConceptualType::Nat64);
            assert_eq!(
                serde_json::to_value(type_ref(5)).unwrap(),
                serde_json::json!({ "kind": "type", "id": 5 })
            );
            assert_eq!(
                serde_json::to_value(decl_ref(2)).unwrap(),
                serde_json::json!({ "kind": "decl", "id": 2 })
            );
        }

        #[test]
        fn recursive_type() {
            let program = ConceptualProgram {
                declarations: vec![ConceptualDecl {
                    name: "List",
                    typ: TypeId(2),
                }],
                types: vec![
                    ConceptualType::Nat,
                    ConceptualType::Record(vec![
                        field("head", type_ref(0)),
                        field("tail", decl_ref(0)),
                    ]),
                    ConceptualType::Opt(type_ref(1)),
                ],
                actor: None,
            };

            let fields = record_fields(program.type_node(TypeId(1)));
            let tail = find_field(fields, "tail");

            assert_eq!(program.decl(DeclId(0)).typ, TypeId(2));
            assert_eq!(tail.typ, decl_ref(0));
            assert_eq!(program.resolve(tail.typ), TypeId(2));
            assert!(matches!(tail.typ, TypeRefIr::Decl { id: DeclId(0) }));
        }

        #[test]
        fn mutual_recursion() {
            let program = ConceptualProgram {
                declarations: vec![
                    ConceptualDecl {
                        name: "A",
                        typ: TypeId(1),
                    },
                    ConceptualDecl {
                        name: "B",
                        typ: TypeId(3),
                    },
                ],
                types: vec![
                    ConceptualType::Opt(decl_ref(1)),
                    ConceptualType::Record(vec![field("b", type_ref(0))]),
                    ConceptualType::Opt(decl_ref(0)),
                    ConceptualType::Record(vec![field("a", type_ref(2))]),
                ],
                actor: None,
            };

            let a_fields = record_fields(program.type_node(program.decl(DeclId(0)).typ));
            let b_reference =
                opt_inner(program.type_node(program.resolve(find_field(a_fields, "b").typ)));
            assert_eq!(b_reference, decl_ref(1));

            let b_fields = record_fields(program.type_node(program.decl(DeclId(1)).typ));
            let a_reference =
                opt_inner(program.type_node(program.resolve(find_field(b_fields, "a").typ)));
            assert_eq!(a_reference, decl_ref(0));
        }

        #[test]
        fn named_service_actor() {
            let program = ConceptualProgram {
                declarations: vec![ConceptualDecl {
                    name: "Backend",
                    typ: TypeId(1),
                }],
                types: vec![
                    ConceptualType::Text,
                    ConceptualType::Service(vec![method(
                        "get",
                        MethodModeIr::Query,
                        vec![],
                        vec![type_ref(0)],
                    )]),
                ],
                actor: Some(ConceptualActor {
                    init_args: vec![],
                    service: TypeId(1),
                }),
            };

            let actor = program.actor.as_ref().unwrap();
            assert!(actor.init_args.is_empty());
            assert_eq!(actor.service, program.decl(DeclId(0)).typ);

            let methods = service_methods(program.type_node(actor.service));
            assert_eq!(methods.len(), 1);
            assert_eq!(methods[0].name, "get");
            assert_eq!(methods[0].mode, MethodModeIr::Query);
            assert_eq!(methods[0].returns, vec![type_ref(0)]);
            assert_eq!(
                program.type_node(program.resolve(methods[0].returns[0])),
                &ConceptualType::Text
            );
        }

        #[test]
        fn repeated_anonymous_types() {
            let repeated_record = ConceptualType::Record(vec![field("value", type_ref(0))]);
            let program = ConceptualProgram {
                declarations: vec![],
                types: vec![
                    ConceptualType::Text,
                    repeated_record.clone(),
                    repeated_record,
                    ConceptualType::Service(vec![
                        method("a", MethodModeIr::Update, vec![type_ref(1)], vec![]),
                        method("b", MethodModeIr::Update, vec![type_ref(2)], vec![]),
                    ]),
                ],
                actor: Some(ConceptualActor {
                    init_args: vec![],
                    service: TypeId(3),
                }),
            };

            assert_ne!(TypeId(1), TypeId(2));
            assert_eq!(program.type_node(TypeId(1)), program.type_node(TypeId(2)));

            let actor = program.actor.as_ref().unwrap();
            let methods = service_methods(program.type_node(actor.service));
            assert_eq!(methods[0].args, vec![type_ref(1)]);
            assert_eq!(methods[1].args, vec![type_ref(2)]);
        }

        fn type_ref(id: u32) -> TypeRefIr {
            TypeRefIr::Type { id: TypeId(id) }
        }

        fn decl_ref(id: u32) -> TypeRefIr {
            TypeRefIr::Decl { id: DeclId(id) }
        }

        fn field(label: &'static str, typ: TypeRefIr) -> ConceptualField {
            ConceptualField { label, typ }
        }

        fn method(
            name: &'static str,
            mode: MethodModeIr,
            args: Vec<TypeRefIr>,
            returns: Vec<TypeRefIr>,
        ) -> ConceptualMethod {
            ConceptualMethod {
                name,
                mode,
                args,
                returns,
            }
        }

        fn find_field<'a>(fields: &'a [ConceptualField], expected: &str) -> &'a ConceptualField {
            fields
                .iter()
                .find(|field| field.label == expected)
                .unwrap_or_else(|| panic!("missing field {expected}"))
        }

        fn opt_inner(typ: &ConceptualType) -> TypeRefIr {
            match typ {
                ConceptualType::Opt(inner) => *inner,
                other => panic!("expected opt type, got {other:?}"),
            }
        }

        fn record_fields(typ: &ConceptualType) -> &[ConceptualField] {
            match typ {
                ConceptualType::Record(fields) => fields,
                other => panic!("expected record type, got {other:?}"),
            }
        }

        fn service_methods(typ: &ConceptualType) -> &[ConceptualMethod] {
            match typ {
                ConceptualType::Service(methods) => methods,
                other => panic!("expected service type, got {other:?}"),
            }
        }

        fn id_index(id: u32) -> usize {
            usize::try_from(id).expect("fixture ID does not fit usize")
        }
    }

    fn declaration<'a>(ir: &'a ProgramIr, name: &str) -> &'a TypeDeclIr {
        ir.graph()
            .unwrap()
            .declaration_by_name(name)
            .unwrap_or_else(|| panic!("missing declaration {name}"))
    }

    fn declaration_id(ir: &ProgramIr, name: &str) -> DeclId {
        ir.graph()
            .unwrap()
            .declaration_id_by_name(name)
            .unwrap_or_else(|| panic!("missing declaration {name}"))
    }

    fn type_node(ir: &ProgramIr, id: TypeId) -> &TypeNodeIr {
        ir.graph().unwrap().type_node(id).unwrap()
    }

    fn declaration_type_node<'a>(ir: &'a ProgramIr, decl: &TypeDeclIr) -> &'a TypeNodeIr {
        type_node(ir, decl.typ)
    }

    fn declaration_record_fields<'a>(ir: &'a ProgramIr, decl: &TypeDeclIr) -> &'a [FieldIr] {
        record_fields(declaration_type_node(ir, decl))
    }

    fn record_fields(node: &TypeNodeIr) -> &[FieldIr] {
        match &node.kind {
            TypeKindIr::Record { fields } => fields,
            other => panic!("expected record node, got {other:?}"),
        }
    }

    fn service_methods(ir: &ProgramIr, service: TypeId) -> Vec<MethodIr> {
        ir.graph()
            .unwrap()
            .service_methods(service)
            .unwrap()
            .into_iter()
            .cloned()
            .collect()
    }

    fn actor_methods(ir: &ProgramIr) -> Vec<MethodIr> {
        ir.graph()
            .unwrap()
            .actor_service_methods()
            .expect("missing actor")
            .into_iter()
            .cloned()
            .collect()
    }

    fn find_method(methods: Vec<MethodIr>, name: &str) -> MethodIr {
        methods
            .into_iter()
            .find(|method| method.name == name)
            .unwrap_or_else(|| panic!("missing method {name}"))
    }

    fn find_field<'a>(fields: &'a [FieldIr], name: &str) -> &'a FieldIr {
        fields
            .iter()
            .find(|field| named(field, name))
            .unwrap_or_else(|| panic!("missing field {name}"))
    }

    fn named(field: &FieldIr, expected: &str) -> bool {
        matches!(&field.label, FieldLabelIr::Named { name } if name == expected)
    }

    fn method_mode(ir: &ProgramIr, name: &str) -> MethodModeIr {
        find_method(actor_methods(ir), name).mode
    }
}
