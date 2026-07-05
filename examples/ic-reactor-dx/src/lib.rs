use std::cell::RefCell;
use std::collections::BTreeMap;

use candid::{CandidType, Deserialize};

type ContactId = String;

#[derive(Clone, Debug, CandidType, Deserialize)]
struct Contact {
    name: String,
    email: String,
    aliases: Vec<String>,
}

thread_local! {
    static CONTACTS: RefCell<BTreeMap<ContactId, Contact>> = RefCell::new(BTreeMap::new());
}

#[ic_cdk::query]
fn lookup_contact(id: ContactId) -> Option<Contact> {
    CONTACTS.with_borrow(|contacts| contacts.get(&id).cloned())
}

#[ic_cdk::update]
fn save_contact(contact: Contact) -> ContactId {
    let id = contact_id(&contact);
    CONTACTS.with_borrow_mut(|contacts| {
        contacts.insert(id.clone(), contact);
    });
    id
}

fn contact_id(contact: &Contact) -> ContactId {
    let normalized = contact.email.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        format!("contact:{}", CONTACTS.with_borrow(|contacts| contacts.len() + 1))
    } else {
        format!("contact:{normalized}")
    }
}
