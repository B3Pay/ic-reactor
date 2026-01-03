import Array "mo:base/Array";
import Principal "mo:base/Principal";

persistent actor TodoList {

  public type Todo = {
    id : Nat;
    description : Text;
    completed : Bool;
    owner : Principal
  };

  var todos : [Todo] = [];
  var nextId : Nat = 0;

  public query ({ caller }) func getAllTodos() : async [Todo] {
    Array.filter<Todo>(todos, func(t) { t.owner == caller })
  };

  public shared ({ caller }) func addTodo(description : Text) : async Nat {
    let id = nextId;
    nextId += 1;

    let newTodo : Todo = {
      id = id;
      description = description;
      completed = false;
      owner = caller
    };

    todos := Array.append<Todo>(todos, [newTodo]);
    id
  };

  public shared ({ caller }) func toggleTodo(id : Nat) : async Bool {
    var found = false;
    todos := Array.map<Todo, Todo>(
      todos,
      func(t) {
        if (t.id == id and t.owner == caller) {
          found := true;
          { t with completed = not t.completed }
        } else {
          t
        }
      }
    );
    found
  };

  public shared ({ caller }) func clearComplete() : async () {
    todos := Array.filter<Todo>(
      todos,
      func(t) {
        if (t.owner == caller) {
          not t.completed
        } else {
          true
        }
      }
    )
  }
}
