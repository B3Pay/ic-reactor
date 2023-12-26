import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import Hash "mo:base/Hash";
import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat";
import Principal "mo:base/Principal";
import Text "mo:base/Text";

actor ToDoList {

  type ToDo = {
    id : Nat;
    description : Text;
    completed : Bool
  };

  type ToDos = [ToDo];

  var userTodos = HashMap.HashMap<Principal.Principal, ToDos>(0, Principal.equal, Principal.hash);

  var nextId : Nat = 0;

  private func updateTodos(caller : Principal.Principal, todos : ToDos) {
    userTodos.put(caller, todos)
  };

  public query ({ caller }) func getAllTodos() : async ?ToDos {
    userTodos.get(caller)
  };

  public shared ({ caller }) func addTodo(description : Text) : async Nat {
    let id = nextId;
    nextId += 1;

    let newTodo = {
      id = id;
      description = description;
      completed = false
    };

    let existingTodos = switch (userTodos.get(caller)) {
      case (null) { [] };
      case (?todos) { todos }
    };

    let updatedTodos = Array.append<ToDo>(existingTodos, [newTodo]);
    updateTodos(caller, updatedTodos);

    id
  };

  public shared ({ caller }) func toggleTodo(id : Nat) : async Bool {
    let todos = switch (userTodos.get(caller)) {
      case (?userTodos) userTodos;
      case null return false
    };

    let updatedTodos = Array.map<ToDo, ToDo>(
      todos,
      func(todo) {
        if (todo.id == id) { { todo with completed = not todo.completed } } else {
          todo
        }
      }
    );

    updateTodos(caller, updatedTodos);

    true
  };

  public shared ({ caller }) func clearComplete() : async () {
    let todos = switch (userTodos.get(caller)) {
      case (?userTodos) userTodos;
      case null return
    };

    let updatedTodos = Array.filter<ToDo>(
      todos,
      func(todo) {
        not todo.completed
      }
    );

    updateTodos(caller, updatedTodos)
  }
}
