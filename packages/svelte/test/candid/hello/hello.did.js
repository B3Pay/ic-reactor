exports.idlFactory = ({ IDL }) => {
  return IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    greet_update: IDL.Func([IDL.Text], [IDL.Text], []),
  })
}
