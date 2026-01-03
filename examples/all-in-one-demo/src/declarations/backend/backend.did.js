export const idlFactory = ({ IDL }) => {
  const Log = IDL.Record({
    action: IDL.Text,
    timestamp: IDL.Int,
    details: IDL.Text,
    caller: IDL.Principal,
  })
  const Post = IDL.Record({
    id: IDL.Nat,
    content: IDL.Text,
    timestamp: IDL.Int,
    caller: IDL.Principal,
  })
  const ChaosResult = IDL.Variant({ ok: IDL.Null, err: IDL.Text })
  return IDL.Service({
    batch_create_posts: IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(IDL.Nat)], []),
    create_post: IDL.Func([IDL.Text], [IDL.Nat], []),
    get_likes: IDL.Func([], [IDL.Vec(IDL.Principal)], ["query"]),
    get_logs: IDL.Func([], [IDL.Vec(Log)], ["query"]),
    get_posts: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Vec(Post)], ["query"]),
    get_posts_count: IDL.Func([], [IDL.Nat], ["query"]),
    get_chaos_status: IDL.Func([], [IDL.Bool], ["query"]),
    like: IDL.Func([], [ChaosResult], []),
    toggle_chaos_mode: IDL.Func([], [IDL.Bool], []),
    unlike: IDL.Func([], [ChaosResult], []),
  })
}
export const init = ({ IDL }) => {
  return []
}
