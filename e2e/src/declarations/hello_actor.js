export const idlFactory = ({ IDL }) => {
  const Status = IDL.Variant({ Active: IDL.Null, Frozen: IDL.Text })
  const Profile = IDL.Record({
    status: Status,
    balance: IDL.Nat,
    owner: IDL.Principal,
    tags: IDL.Vec(IDL.Text),
    nonce: IDL.Nat64,
    delta: IDL.Int,
    avatar: IDL.Opt(IDL.Vec(IDL.Nat8)),
  })
  return IDL.Service({
    boom: IDL.Func([], [], []),
    count: IDL.Func([], [IDL.Nat], ["query"]),
    divide: IDL.Func(
      [IDL.Nat, IDL.Nat],
      [IDL.Variant({ Ok: IDL.Nat, Err: IDL.Text })],
      ["query"]
    ),
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    greet_update: IDL.Func([IDL.Text], [IDL.Text], []),
    increment: IDL.Func([], [IDL.Nat], []),
    profile: IDL.Func([IDL.Principal], [Profile], ["query"]),
    whoami: IDL.Func([], [IDL.Principal], ["query"]),
  })
}
export const init = ({ IDL }) => {
  return []
}
