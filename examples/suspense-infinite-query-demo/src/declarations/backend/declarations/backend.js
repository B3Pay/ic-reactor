export const idlFactory = ({ IDL }) => {
  const Post = IDL.Record({
    id: IDL.Nat,
    title: IDL.Text,
    content: IDL.Text,
    views: IDL.Nat,
    author: IDL.Text,
    likes: IDL.Nat,
    timestamp: IDL.Text,
    replies: IDL.Nat,
    reposts: IDL.Nat,
    category: IDL.Text,
    handle: IDL.Text,
    avatar: IDL.Text,
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
