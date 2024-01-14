#[ic_cdk::query]
fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}

#[ic_cdk::update]
fn greet_update(name: String) -> String {
    format!("Hello, {}!", name)
}
