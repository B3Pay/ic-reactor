//! The canister the e2e suite runs against. Besides `greet`, each method puts
//! one kind of value, or one kind of failure, on the wire. The interface is
//! written out by hand in `hello_actor.did`, which the build embeds as the
//! `candid:service` metadata, so a method added here must be added there too.

use std::cell::Cell;

use candid::{CandidType, Int, Nat, Principal};
use serde_bytes::ByteBuf;

thread_local! {
    static COUNTER: Cell<u64> = const { Cell::new(0) };
}

/// A variant with an arm that carries nothing and an arm that carries text.
#[derive(CandidType)]
enum Status {
    Active,
    Frozen(String),
}

/// A record with a field of each kind the display transforms handle: big
/// integers, a principal, a vector, an optional blob and a variant. The
/// integers are past what a JavaScript number holds exactly.
#[derive(CandidType)]
struct Profile {
    owner: Principal,
    balance: Nat,
    nonce: u64,
    delta: Int,
    tags: Vec<String>,
    avatar: Option<ByteBuf>,
    status: Status,
}

#[ic_cdk::query]
fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}

#[ic_cdk::update]
fn greet_update(name: String) -> String {
    format!("Hello, {}!", name)
}

/// `Ok` with the quotient, or `Err` when the divisor is zero.
#[ic_cdk::query]
fn divide(dividend: Nat, divisor: Nat) -> Result<Nat, String> {
    if divisor == 0u32 {
        return Err("division by zero".to_string());
    }
    Ok(dividend / divisor)
}

/// A fixed profile for `owner`. The anonymous principal gets no avatar and a
/// `Frozen` status, any other principal an avatar and an `Active` one, so a
/// caller can ask for either arm of the option and of the variant.
#[ic_cdk::query]
fn profile(owner: Principal) -> Profile {
    let anonymous = owner == Principal::anonymous();
    Profile {
        owner,
        balance: Nat::from(u128::MAX),
        nonce: u64::MAX,
        delta: Int::from(i128::MIN),
        tags: vec!["alpha".to_string(), "beta".to_string()],
        avatar: (!anonymous).then(|| ByteBuf::from(vec![0xde, 0xad, 0xbe, 0xef])),
        status: if anonymous {
            Status::Frozen("anonymous".to_string())
        } else {
            Status::Active
        },
    }
}

/// Adds one to the counter and returns the new value.
#[ic_cdk::update]
fn increment() -> Nat {
    let next = COUNTER.get() + 1;
    COUNTER.set(next);
    Nat::from(next)
}

#[ic_cdk::query]
fn count() -> Nat {
    Nat::from(COUNTER.get())
}

/// Always traps, so the call is rejected rather than answered.
#[ic_cdk::update]
fn boom() {
    ic_cdk::trap("boom: this method always traps");
}

/// The principal that signed the call.
#[ic_cdk::query]
fn whoami() -> Principal {
    ic_cdk::api::msg_caller()
}
