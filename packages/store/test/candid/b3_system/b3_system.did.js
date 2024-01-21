export const idlFactory = ({ IDL }) => {
  const Value = IDL.Rec()
  Value.fill(
    IDL.Variant({
      Int: IDL.Int,
      Map: IDL.Vec(IDL.Tuple(IDL.Text, Value)),
      Nat: IDL.Nat,
      Nat64: IDL.Nat64,
      Blob: IDL.Vec(IDL.Nat8),
      Text: IDL.Text,
      Array: IDL.Vec(Value),
    })
  )
  const CreateAppArgs = IDL.Record({
    metadata: IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    name: IDL.Text,
    description: IDL.Text,
  })
  return IDL.Service({
    create_app: IDL.Func([CreateAppArgs], [], []),
  })
}
export const init = ({ IDL }) => {
  return []
}
