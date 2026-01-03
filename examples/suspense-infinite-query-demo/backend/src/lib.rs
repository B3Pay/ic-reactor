use candid::{CandidType, Deserialize, Nat};
use ic_cdk::query;
use std::cell::RefCell;

#[derive(CandidType, Deserialize, Clone)]
struct Post {
    id: Nat,
    title: String,
    content: String,
    category: String,
}

#[derive(CandidType, Deserialize)]
struct PostsResponse {
    posts: Vec<Post>,
    next_cursor: Option<Nat>,
}

// Simulate a database
thread_local! {
    static POSTS: RefCell<Vec<Post>> = RefCell::new(generate_dummy_posts(100));
}

fn generate_dummy_posts(count: u64) -> Vec<Post> {
    let categories = vec!["Tech", "Lifestyle", "Education"];
    (1..=count)
        .map(|i| {
            let category = categories[(i % 3) as usize];
            Post {
                id: Nat::from(i),
                title: format!("{} Post #{}", category, i),
                content: format!(
                    "This is a {} post number {}. It comes directly from the Rust canister!",
                    category, i
                ),
                category: category.to_string(),
            }
        })
        .collect()
}

#[query]
fn get_posts(category: Option<String>, cursor: Nat, limit: Nat) -> PostsResponse {
    POSTS.with(|posts| {
        let posts = posts.borrow();

        // Filter by category if provided
        let filtered_posts: Vec<&Post> = if let Some(cat) = category {
            posts.iter().filter(|p| p.category == cat).collect()
        } else {
            posts.iter().collect()
        };

        let start_index: usize = cursor.0.try_into().unwrap_or(0);
        let limit_usize: usize = limit.0.try_into().unwrap_or(0);

        if start_index >= filtered_posts.len() {
            return PostsResponse {
                posts: Vec::new(),
                next_cursor: None,
            };
        }

        let end_index = std::cmp::min(start_index + limit_usize, filtered_posts.len());
        let page_posts = filtered_posts[start_index..end_index]
            .iter()
            .map(|&p| p.clone())
            .collect();

        let next_cursor = if end_index < filtered_posts.len() {
            Some(Nat::from(end_index))
        } else {
            None
        };

        PostsResponse {
            posts: page_posts,
            next_cursor,
        }
    })
}
