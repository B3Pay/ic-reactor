export const idlFactory = ({ IDL }) => {
  const ToDo = IDL.Record({
    id: IDL.Nat,
    completed: IDL.Bool,
    description: IDL.Text,
  })
  const ToDos = IDL.Vec(ToDo)
  return IDL.Service({
    addTodo: IDL.Func([IDL.Text], [IDL.Nat], []),
    clearComplete: IDL.Func([], [], []),
    getAllTodos: IDL.Func([], [IDL.Opt(ToDos)], ["query"]),
    toggleTodo: IDL.Func([IDL.Nat], [IDL.Bool], []),
  })
}
export const init = ({ IDL }) => {
  return []
}
