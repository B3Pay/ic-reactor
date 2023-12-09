export const idlFactory = ({ IDL }) => {
  const ToDo = IDL.Record({ 'completed' : IDL.Bool, 'description' : IDL.Text });
  return IDL.Service({
    'addTodo' : IDL.Func([IDL.Text], [IDL.Nat], []),
    'clearComplete' : IDL.Func([], [], []),
    'getAllTodos' : IDL.Func(
        [],
        [IDL.Vec(IDL.Tuple(IDL.Nat, ToDo))],
        ['query'],
      ),
    'toggleTodo' : IDL.Func([IDL.Nat], [], []),
  });
};
export const init = ({ IDL }) => { return []; };
