export const idlFactory = ({ IDL }) => {
  const Post = IDL.Record({
    id: IDL.Nat,
    title: IDL.Text,
    content: IDL.Text,
    category: IDL.Text,
    author: IDL.Text,
    handle: IDL.Text,
    avatar: IDL.Text,
    timestamp: IDL.Text,
    likes: IDL.Nat,
    reposts: IDL.Nat,
    replies: IDL.Nat,
    views: IDL.Nat,
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
