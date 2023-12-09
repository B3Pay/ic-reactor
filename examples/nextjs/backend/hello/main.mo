import Hash "mo:base/Hash";
import Map "mo:base/HashMap";
import Iter "mo:base/Iter";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat";
import Text "mo:base/Text";

actor ToDoList {

  type ToDo = {
    description : Text;
    completed : Bool
  };

  func natHash(n : Nat) : Hash.Hash {
    Text.hash(Nat.toText(n))
  };

  var todos = Map.HashMap<Nat, ToDo>(0, Nat.equal, natHash);
  var nextId : Nat = 0;

  public query func getAllTodos() : async [(Nat, ToDo)] {
    Iter.toArray(todos.entries())
  };

  public func addTodo(description : Text) : async Nat {
    let id = nextId;
    todos.put(id, { description = description; completed = false });
    nextId += 1;
    id
  };

  public func toggleTodo(id : Nat) : async () {
    ignore do ? {
      let todo = todos.get(id)!;
      let description = todo.description;
      let completed = if (todo.completed) { false } else { true };
      todos.put(id, { description; completed })
    }
  };

  public func clearComplete() : async () {
    todos := Map.mapFilter<Nat, ToDo, ToDo>(
      todos,
      Nat.equal,
      natHash,
      func(_, todo) { if (todo.completed) null else ?todo }
    )
  }
}
