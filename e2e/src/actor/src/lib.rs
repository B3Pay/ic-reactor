//! The canister the e2e suite runs against. Each method puts one kind of
//! value, or one kind of failure, on the wire. The interface is written out by
//! hand in `hello_actor.did`, which the build embeds as the `candid:service`
//! metadata, so a method added here must be added there too, and the module in
//! `src/declarations` generated again (see the e2e README).

use std::cell::Cell;

use candid::{Nat, Principal};

thread_local! {
    static COUNTER: Cell<u64> = const { Cell::new(0) };
}

/// A query.
#[ic_cdk::query]
fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}

/// Whether the call runs in replicated mode: `false` for a query sent as one,
/// `true` for a query sent as an update call, which is how a certified read
/// goes out.
#[ic_cdk::query]
fn is_replicated() -> bool {
    ic_cdk::api::in_replicated_execution()
}

/// Adds one to the counter and returns the new value.
#[ic_cdk::update]
fn increment() -> Nat {
    let next = COUNTER.get() + 1;
    COUNTER.set(next);
    Nat::from(next)
}

/// The counter, as `increment` and `increment_by` left it.
#[ic_cdk::query]
fn count() -> Nat {
    Nat::from(COUNTER.get())
}

/// Adds `by` to the counter and returns `Ok` with the new value, or returns
/// `Err` without changing anything when `by` is zero: the `Err` arm of a
/// Result from an update.
#[ic_cdk::update]
fn increment_by(by: u64) -> Result<Nat, String> {
    if by == 0 {
        return Err("by must be positive".to_string());
    }
    let next = COUNTER.get().saturating_add(by);
    COUNTER.set(next);
    Ok(Nat::from(next))
}

/// Rejects the call with `ic0.msg_reject`, which the IC reports as reject code
/// 4 (CANISTER_REJECT).
#[ic_cdk::update(manual_reply = true)]
fn refuse() {
    ic_cdk::api::msg_reject("refused: this method always rejects");
}

/// Always traps, which the IC reports as reject code 5 (CANISTER_ERROR).
#[ic_cdk::update]
fn boom() {
    ic_cdk::trap("boom: this method always traps");
}

/// The principal that signed the call.
#[ic_cdk::query]
fn whoami() -> Principal {
    ic_cdk::api::msg_caller()
}
