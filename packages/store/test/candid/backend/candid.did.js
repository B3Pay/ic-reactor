const {
  Record,
  Vec,
  Nat64,
  Opt,
  Nat8,
  Text,
  Variant,
  Tuple,
  Null,
  Service,
  Func,
  Nat,
  Nat32,
} = require("@dfinity/candid/lib/cjs/idl")

const AnonymousUserData = Record({
  texts: Vec(Nat64),
  created_at: Nat64,
  decryption_key: Opt(Vec(Nat8)),
})
const UserText = Record({ id: Text, text: Vec(Nat8) })
const OneTimeKey = Record({
  public_key: Vec(Nat8),
  expiration: Nat64,
})
const LogEntry = Record({
  counter: Nat64,
  file: Text,
  line: Nat32,
  version: Text,
  message: Text,
  timestamp: Nat64,
})
const Result = Variant({
  Ok: Tuple(Vec(Nat8), Vec(Nat8)),
  Err: Text,
})
const Task = Variant({
  CleanUpKeys: Null,
  SendText: Record({ body: Text, phone_number: Text }),
  CleanUpAnonymousUsers: Null,
  SendEmail: Record({
    subject: Text,
    body: Text,
    email: Text,
  }),
  Initialize: Null,
})
const TaskTimerEntry = Record({ task: Task, time: Nat64 })
const AuthenticatedSignature = Record({
  signature: Vec(Nat8),
  created_at: Nat64,
})
const IdentifiedUserData = Record({
  texts: Vec(Nat64),
  signature: Opt(AuthenticatedSignature),
  public_key: Vec(Nat8),
})

exports.idlFactory = ({ IDL }) => {
  return Service({
    anonymous_user: Func([Vec(Nat8)], [AnonymousUserData], ["query"]),
    anonymous_user_notes: Func([Vec(Nat8)], [Vec(UserText)], ["query"]),
    canister_cycle_balance: Func([], [Nat], ["query"]),
    edit_encrypted_text: Func([Nat64, Vec(Nat8), Opt(Vec(Nat8))], [], []),
    encrypted_ibe_decryption_key_for_caller: Func([Vec(Nat8)], [Vec(Nat8)], []),
    encrypted_symmetric_key_for_caller: Func([Vec(Nat8)], [Vec(Nat8)], []),
    get_one_time_key: Func([Nat64], [Vec(Nat8)], ["query"]),
    get_one_time_key_details: Func([Nat64], [OneTimeKey], ["query"]),
    ibe_encryption_key: Func([], [Vec(Nat8)], ["query"]),
    partition_details: Func([], [Vec(Tuple(Text, Nat8))], ["query"]),
    print_log_entries: Func([], [Vec(LogEntry)], ["query"]),
    print_log_entries_page: Func([Nat64, Opt(Nat64)], [Vec(Text)], ["query"]),
    read_with_one_time_key: Func([Nat64, Vec(Nat8), Vec(Nat8)], [Result], []),
    request_two_factor_authentication_for_caller: Func([Vec(Nat8)], [Text], []),
    save_encrypted_text: Func([Vec(Nat8), Opt(Vec(Nat8))], [Nat64], []),
    set_one_time_key: Func([Nat64, Vec(Nat8)], [], []),
    symmetric_key_verification_key: Func([], [Vec(Nat8)], ["query"]),
    timers: Func([], [Vec(TaskTimerEntry)], ["query"]),
    two_factor_verification_key: Func([], [Vec(Nat8)], []),
    user_data: Func([], [IdentifiedUserData], ["query"]),
    user_notes: Func([Opt(Vec(Nat8))], [Nat64, Vec(UserText)], ["query"]),
    version: Func([], [Text], ["query"]),
  })
}
