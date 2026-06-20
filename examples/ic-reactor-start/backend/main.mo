persistent actor {
  var count : Nat = 0;

  public query func greet(name : Text) : async Text {
    "Hello, " # name # "!"
  };

  public func increment() : async Nat {
    count += 1;
    count
  };

  public query func getCount() : async Nat {
    count
  };
}
