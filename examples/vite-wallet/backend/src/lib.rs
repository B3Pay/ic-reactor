//! The wallet's backend: per caller, a profile name and an address book.
//!
//! The interface is written out by hand in `backend.did`, which the build
//! embeds as the `candid:service` metadata and the app generates its module
//! from, so a method added here must be added there too.
//!
//! State lives on the heap and starts over on an upgrade: enough for a local
//! demo, not for a canister that keeps users' data.

use std::cell::RefCell;
use std::collections::BTreeMap;

use candid::{CandidType, Deserialize, Principal};

#[derive(CandidType, Deserialize, Clone)]
struct Contact {
    name: String,
    owner: Principal,
}

#[derive(CandidType, Deserialize, Clone)]
struct Profile {
    name: String,
}

/// Why a write was refused: the `Err` arm of every write's result.
#[derive(CandidType, Deserialize)]
enum Refusal {
    Anonymous,
    InvalidName(String),
    DuplicateName(String),
    NotFound(String),
    Full(u32),
}

#[derive(Default)]
struct Entry {
    profile: Option<Profile>,
    contacts: Vec<Contact>,
}

const MAX_NAME_CHARS: usize = 32;
const MAX_CONTACTS: u32 = 20;

thread_local! {
    static ENTRIES: RefCell<BTreeMap<Principal, Entry>> = RefCell::default();
}

/// The caller, unless it is the anonymous principal, which owns nothing here.
fn signed_caller() -> Result<Principal, Refusal> {
    let caller = ic_cdk::api::msg_caller();
    if caller == Principal::anonymous() {
        Err(Refusal::Anonymous)
    } else {
        Ok(caller)
    }
}

/// `name` without surrounding spaces, or why it is refused.
fn checked_name(name: &str) -> Result<String, Refusal> {
    let name = name.trim();
    let length = name.chars().count();
    if length == 0 || length > MAX_NAME_CHARS || name.chars().any(char::is_control) {
        return Err(Refusal::InvalidName(format!(
            "a name is 1 to {MAX_NAME_CHARS} characters, with no control characters"
        )));
    }
    Ok(name.to_string())
}

#[ic_cdk::query]
fn get_profile() -> Option<Profile> {
    let caller = ic_cdk::api::msg_caller();
    ENTRIES.with_borrow(|entries| entries.get(&caller)?.profile.clone())
}

#[ic_cdk::update]
fn set_name(name: String) -> Result<Profile, Refusal> {
    let caller = signed_caller()?;
    let profile = Profile {
        name: checked_name(&name)?,
    };
    ENTRIES.with_borrow_mut(|entries| {
        entries.entry(caller).or_default().profile = Some(profile.clone());
    });
    Ok(profile)
}

#[ic_cdk::query]
fn contacts() -> Vec<Contact> {
    let caller = ic_cdk::api::msg_caller();
    ENTRIES.with_borrow(|entries| {
        entries
            .get(&caller)
            .map(|entry| entry.contacts.clone())
            .unwrap_or_default()
    })
}

#[ic_cdk::update]
fn add_contact(contact: Contact) -> Result<(), Refusal> {
    let caller = signed_caller()?;
    let name = checked_name(&contact.name)?;
    ENTRIES.with_borrow_mut(|entries| {
        let book = &mut entries.entry(caller).or_default().contacts;
        if book.iter().any(|c| c.name.to_lowercase() == name.to_lowercase()) {
            return Err(Refusal::DuplicateName(name));
        }
        if book.len() >= MAX_CONTACTS as usize {
            return Err(Refusal::Full(MAX_CONTACTS));
        }
        book.push(Contact {
            name,
            owner: contact.owner,
        });
        Ok(())
    })
}

#[ic_cdk::update]
fn remove_contact(name: String) -> Result<(), Refusal> {
    let caller = signed_caller()?;
    ENTRIES.with_borrow_mut(|entries| {
        let book = &mut entries.entry(caller).or_default().contacts;
        let before = book.len();
        book.retain(|c| c.name != name);
        if book.len() == before {
            Err(Refusal::NotFound(name))
        } else {
            Ok(())
        }
    })
}
