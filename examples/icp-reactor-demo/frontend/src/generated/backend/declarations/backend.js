export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    get_counter: IDL.Func([], [IDL.Nat], ["query"]),
    get_message: IDL.Func([], [IDL.Opt(IDL.Text)], ["query"]),
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    increment: IDL.Func([], [IDL.Nat], []),
    set_message: IDL.Func([IDL.Text], [], []),
  })
}
export const init = ({ IDL }) => {
  return []
}
