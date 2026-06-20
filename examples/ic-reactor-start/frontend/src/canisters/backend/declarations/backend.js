export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    getCount: IDL.Func([], [IDL.Nat], ["query"]),
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    increment: IDL.Func([], [IDL.Nat], []),
  })
}
export const init = ({ IDL }) => {
  return []
}
