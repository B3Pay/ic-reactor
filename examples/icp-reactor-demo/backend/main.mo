/**
 * IC-Reactor Demo Backend Canister
 *
 * A simple Motoko canister that demonstrates:
 * - Query methods (greet, get_message, get_counter)
 * - Update methods (set_message, increment)
 *
 * This aligns with the Candid interface in backend.did
 */

persistent actor {
  // ═══════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════

  /// Optional message that can be set by users
  var message : ?Text = null;

  /// Counter that can be incremented
  var counter : Nat = 0;

  // ═══════════════════════════════════════════════════════════════════════
  // QUERY METHODS (fast, read-only)
  // ═══════════════════════════════════════════════════════════════════════

  /// Greet someone by name
  /// @param name - The name to greet
  /// @returns A greeting message
  public query func greet(name : Text) : async Text {
    return "Hello, " # name # "!"
  };

  /// Get the current message
  /// @returns The message if set, null otherwise
  public query func get_message() : async ?Text {
    return message
  };

  /// Get the current counter value
  /// @returns The counter value
  public query func get_counter() : async Nat {
    return counter
  };

  // ═══════════════════════════════════════════════════════════════════════
  // UPDATE METHODS (slower, can modify state)
  // ═══════════════════════════════════════════════════════════════════════

  /// Set a new message
  /// @param newMessage - The message to store
  public func set_message(newMessage : Text) : async () {
    message := ?newMessage
  };

  /// Increment the counter by 1
  /// @returns The new counter value after incrementing
  public func increment() : async Nat {
    counter += 1;
    return counter
  }
}
