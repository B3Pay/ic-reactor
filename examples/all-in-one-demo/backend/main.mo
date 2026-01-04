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

  public shared (msg) func batch_create_posts(count : Nat) : async [Nat] {
    var ids : [Nat] = [];
    var newPosts : [Post] = [];

    var i = 0;
    while (i < count) {
      let id = nextId;
      nextId += 1;
      
      let content = "Auto-generated post #" # debug_show(id);

      let newPost : Post = {
        id = id;
        content = content;
        caller = msg.caller;
        timestamp = Time.now()
      };
      
      newPosts := Array.append([newPost], newPosts);
      ids := Array.append(ids, [id]);
      appendLog(msg.caller, "create_post", content);
      
      i += 1;
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
