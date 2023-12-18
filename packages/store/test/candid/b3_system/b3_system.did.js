export const idlFactory = ({ IDL }) => {
  const Value = IDL.Rec()
  const CreateAppArgs = IDL.Record({
    metadata: IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    name: IDL.Text,
    description: IDL.Text,
  })
  const ReleaseView = IDL.Record({
    features: IDL.Text,
    date: IDL.Nat64,
    name: IDL.Text,
    size: IDL.Nat64,
    version: IDL.Text,
    deprecated: IDL.Bool,
  })
  const AppView = IDL.Record({
    id: IDL.Text,
    updated_at: IDL.Nat64,
    metadata: IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    name: IDL.Text,
    description: IDL.Text,
    created_at: IDL.Nat64,
    created_by: IDL.Text,
    latest_release: IDL.Opt(ReleaseView),
    install_count: IDL.Nat64,
  })
  return IDL.Service({
    create_app: IDL.Func([CreateAppArgs], [AppView], []),
  })
}
export const init = ({ IDL }) => {
  return []
}
