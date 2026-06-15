use candid::{CandidType, Deserialize, Nat};
use ic_cdk::query;
use std::cell::RefCell;

#[derive(CandidType, Deserialize, Clone)]
struct Post {
    id: Nat,
    title: String,
    content: String,
    category: String,
    // Social metadata — stored in the canister, not fabricated on the frontend
    author: String,
    handle: String,
    avatar: String,
    timestamp: String,
    likes: Nat,
    reposts: Nat,
    replies: Nat,
    views: Nat,
}

#[derive(CandidType, Deserialize)]
struct PostsResponse {
    posts: Vec<Post>,
    next_cursor: Option<Nat>,
}

thread_local! {
    static POSTS: RefCell<Vec<Post>> = RefCell::new(seed_posts(100));
}

fn seed_posts(count: u64) -> Vec<Post> {
    let authors = [
        ("Alice Chen",    "alice_chen",   "🦊"),
        ("Bob Dev",       "bob_dev",      "🐻"),
        ("Tech Guru",     "tech_guru",    "🦁"),
        ("Life Hacker",   "life_hacker",  "🐯"),
        ("Edu Fan",       "edu_fan",      "🦄"),
        ("Rustacean",     "rustacean",    "🐸"),
        ("IC Builder",    "ic_builder",   "🦋"),
        ("Web3 Nerd",     "web3_nerd",    "🦅"),
        ("Crypto Cat",    "crypto_cat",   "🐺"),
        ("dApp Wizard",   "dapp_wiz",     "🦝"),
    ];
    let timestamps = ["1m", "4m", "12m", "28m", "1h", "2h", "5h", "11h", "1d", "2d"];
    let categories = ["Tech", "Lifestyle", "Education"];

    (1..=count)
        .map(|i| {
            let cat = categories[((i - 1) % 3) as usize];
            let (name, handle, avatar) = authors[(i % 10) as usize];
            let ts = timestamps[(i % 10) as usize];

            let (title, content) = match cat {
                "Tech" => (
                    format!("Building on the Internet Computer — post #{i}"),
                    format!(
                        "Just shipped a new feature using Rust and Candid on the IC. \
                        The on-chain computation model is unlike anything I've worked with before. \
                        No servers, no cloud bills — it just runs. 🚀 #{cat} #ICP #Rust"
                    ),
                ),
                "Lifestyle" => (
                    format!("Day {i} of the remote-work experiment"),
                    format!(
                        "Working from a café in Lisbon today. \
                        Strong espresso, fast WiFi, and a deadline that refuses to respect time zones. \
                        This is the dream, right? ☕ #RemoteWork #{cat} #DigitalNomad"
                    ),
                ),
                _ => (
                    format!("Learning tip #{i}: compound understanding"),
                    format!(
                        "The best way to learn a complex topic is to build something with it. \
                        Started a small side project to understand consensus algorithms — \
                        three days in and the textbook finally makes sense. 📖 #{cat} #LearningInPublic"
                    ),
                ),
            };

            Post {
                id: Nat::from(i),
                title,
                content,
                category: cat.to_string(),
                author: name.to_string(),
                handle: handle.to_string(),
                avatar: avatar.to_string(),
                timestamp: ts.to_string(),
                likes: Nat::from((i * 37) % 8000),
                reposts: Nat::from((i * 13) % 1500),
                replies: Nat::from((i * 7) % 400),
                views: Nat::from(((i * 131) % 50 + 1) * 1000),
            }
        })
        .collect()
}

#[query]
fn get_posts(category: Option<String>, cursor: Nat, limit: Nat) -> PostsResponse {
    POSTS.with(|posts| {
        let posts = posts.borrow();

        let filtered: Vec<&Post> = if let Some(cat) = category {
            posts.iter().filter(|p| p.category == cat).collect()
        } else {
            posts.iter().collect()
        };

        let start: usize = cursor.0.try_into().unwrap_or(0);
        let lim: usize = limit.0.try_into().unwrap_or(10);

        if start >= filtered.len() {
            return PostsResponse { posts: vec![], next_cursor: None };
        }

        let end = (start + lim).min(filtered.len());
        let page_posts = filtered[start..end].iter().map(|&p| p.clone()).collect();
        let next_cursor = if end < filtered.len() { Some(Nat::from(end)) } else { None };

        PostsResponse { posts: page_posts, next_cursor }
    })
}
