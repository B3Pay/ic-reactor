/**
 * The playground's starting .did: a small service that touches every kind
 * of field the forms handle (records, variants with and without payloads,
 * options, vectors, blobs, principals, floats, tuples, a recursive type, a
 * func reference) and every mode.
 */
export const SAMPLE_DID = `type Account = record { owner : principal; subaccount : opt blob };

type Priority = variant {
  Low;
  Normal;
  High;
  Urgent : record { reason : text };
};

type Note = record {
  id : nat64;
  title : text;
  body : opt text;
  tags : vec text;
  priority : Priority;
  owner : Account;
  attachment : opt blob;
  score : float64;
};

// A binary tree of numbers: the forms expand it one level at a time.
type Tree = variant { Leaf : nat; Node : record { left : Tree; right : Tree } };

type Callback = func (nat64) -> () oneway;

// A notes service: paste your own .did over it.
service : {
  // One note by id, if it exists.
  get_note : (nat64) -> (opt Note) query;
  list_notes : (record { offset : nat32; limit : nat8 }) -> (vec Note) query;
  tag_counts : () -> (vec record { text; nat }) query;
  sum_tree : (Tree) -> (nat) query;
  add_note : (Note) -> (variant { Ok : nat64; Err : text });
  subscribe : (Callback) -> ();
  ping : () -> () oneway;
}
`
