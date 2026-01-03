export const idlFactory = ({ IDL }) => {
  const Post = IDL.Record({
    id: IDL.Nat,
    title: IDL.Text,
    content: IDL.Text,
    category: IDL.Text,
  })
  const PostsResponse = IDL.Record({
    next_cursor: IDL.Opt(IDL.Nat),
    posts: IDL.Vec(Post),
  })
  return IDL.Service({
    get_posts: IDL.Func(
      [IDL.Opt(IDL.Text), IDL.Nat, IDL.Nat],
      [PostsResponse],
      ["query"]
    ),
  })
}
export const init = ({ IDL }) => {
  return []
}
