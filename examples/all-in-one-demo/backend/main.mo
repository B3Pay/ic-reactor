import Time "mo:base/Time";
import Array "mo:base/Array";
import Principal "mo:base/Principal";
import Result "mo:base/Result";

persistent actor {

  type Log = {
    timestamp : Int;
    caller : Principal;
    action : Text;
    details : Text
  };

  type Post = {
    id : Nat;
    content : Text;
    caller : Principal;
    timestamp : Int
  };

  type ChaosResult = Result.Result<(), Text>;

  var likes : [Principal] = [];
  var logs : [Log] = [];
  var posts : [Post] = [];
  var nextId : Nat = 0;
  var shouldFail : Bool = false;

  public query func get_likes() : async [Principal] {
    return likes
  };

  public query func get_logs() : async [Log] {
    return logs
  };

  public query func get_posts(offset : Nat, limit : Nat) : async [Post] {
    let len = posts.size();
    if (offset >= len) return [];
    let end = if (offset + limit > len) len else offset + limit;
    let count = end - offset;

    return Array.tabulate(
      count,
      func(i) {
        posts[offset + i]
      },
    )
  };

  public query func get_posts_count() : async Nat {
    return posts.size()
  };

  public shared (msg) func toggle_chaos_mode() : async Bool {
    shouldFail := not shouldFail;
    appendLog(msg.caller, "toggle_chaos_mode", "Chaos Mode Toggled");
    return shouldFail
  };

  public query func get_chaos_status() : async Bool {
    return shouldFail
  };

  public shared (msg) func like() : async ChaosResult {
    if (shouldFail) {
      return #err("Chaos Mode Active: Simulated failure! 💥")
    };

    let caller = msg.caller;

    // Check if already liked
    if (isLiked(caller)) {
      return #ok(())
    };

    // Add to likes
    likes := Array.append(likes, [caller]);

    appendLog(caller, "like", "User liked the global heart");
    return #ok(())
  };

  public shared (msg) func unlike() : async ChaosResult {
    if (shouldFail) {
      return #err("Chaos Mode Active: Simulated failure! 💥")
    };

    let caller = msg.caller;

    // Remove from likes
    likes := Array.filter(
      likes,
      func(p : Principal) : Bool {
        return p != caller
      },
    );

    appendLog(caller, "unlike", "User unliked the global heart");
    return #ok(())
  };

  public shared (msg) func create_post(content : Text) : async Nat {
    let id = nextId;
    nextId += 1;
    let newPost : Post = {
      id = id;
      content = content;
      caller = msg.caller;
      timestamp = Time.now()
    };
    posts := Array.append([newPost], posts);
    appendLog(msg.caller, "create_post", content);
    return id
  };

  public shared (msg) func batch_create_posts(contents : [Text]) : async [Nat] {
    var ids : [Nat] = [];
    var newPosts : [Post] = [];

    // Create new posts
    for (content in contents.vals()) {
      let id = nextId;
      nextId += 1;
      let newPost : Post = {
        id = id;
        content = content;
        caller = msg.caller;
        timestamp = Time.now()
      };
      // We'll prepend them later, so let's collect them.
      // If we want the *last* content to be the *top* post (newest), we should process in order
      // and then reverse, OR just collect and prepend the whole block such that
      // [p1, p2, p3] + old -> [p3, p2, p1] + old?
      // Actually standard 'create' prepends.
      // If I send [a, b, c].
      // create(a) -> [a, old]
      // create(b) -> [b, a, old]
      // create(c) -> [c, b, a, old]
      // So effectively we want to reverse the input array and prepend?
      // Or just loop and prepend.
      // Loop and prepend is easiest to match semantics.

      // Let's optimize slightly by building the reversed list then appending to posts once.
      // But Motoko arrays are immutable.
      // List structure is better for prepending.
      // But `posts` is `[Post]`.

      // I'll stick to the loop for simplicity and matching the exact behavior of calling create_post N times.
      // Optimization: Do it in one `Array.append`.
      // Target: [newN, ..., new1] ++ old
      newPosts := Array.append([newPost], newPosts); // Prepend to local batch -> [new current, ... others]
      ids := Array.append(ids, [id]);
      appendLog(msg.caller, "create_post", content)
    };

    posts := Array.append(newPosts, posts);
    return ids
  };

  func isLiked(p : Principal) : Bool {
    for (like in likes.vals()) {
      if (like == p) return true
    };
    return false
  };

  func appendLog(caller : Principal, action : Text, details : Text) {
    let newLog : Log = {
      timestamp = Time.now();
      caller = caller;
      action = action;
      details = details
    };
    logs := Array.append(logs, [newLog])
  }
}
