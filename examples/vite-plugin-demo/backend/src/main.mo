persistent actor {
  var count : Nat = 0;

  public query func greet(name : Text) : async Text {
    return "Hello, " # name # "!";
  };

  public func increment() : async Nat {
    count += 1;
    return count;
  };

  public query func getCount() : async Nat {
    return count;
  };
}
