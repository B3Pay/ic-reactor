export const idlFactory = ({ IDL }) => {
  const Value = IDL.Rec();
  const CreateReleaseArgs = IDL.Record({
    'features' : IDL.Text,
    'size' : IDL.Nat64,
    'version' : IDL.Text,
    'app_id' : IDL.Text,
    'wasm_hash' : IDL.Vec(IDL.Nat8),
  });
  const ReleaseView = IDL.Record({
    'features' : IDL.Text,
    'date' : IDL.Nat64,
    'name' : IDL.Text,
    'size' : IDL.Nat64,
    'version' : IDL.Text,
    'deprecated' : IDL.Bool,
    'wasm_hash' : IDL.Text,
  });
  Value.fill(
    IDL.Variant({
      'Int' : IDL.Int,
      'Map' : IDL.Vec(IDL.Tuple(IDL.Text, Value)),
      'Nat' : IDL.Nat,
      'Nat64' : IDL.Nat64,
      'Blob' : IDL.Vec(IDL.Nat8),
      'Text' : IDL.Text,
      'Array' : IDL.Vec(Value),
    })
  );
  const UserView = IDL.Record({
    'updated_at' : IDL.Nat64,
    'metadata' : IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    'created_at' : IDL.Nat64,
    'canisters' : IDL.Vec(IDL.Principal),
  });
  const Result = IDL.Variant({ 'Ok' : UserView, 'Err' : IDL.Text });
  const CreateAppArgs = IDL.Record({
    'metadata' : IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    'name' : IDL.Text,
    'description' : IDL.Text,
  });
  const AppView = IDL.Record({
    'updated_at' : IDL.Nat64,
    'metadata' : IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    'name' : IDL.Text,
    'description' : IDL.Text,
    'created_at' : IDL.Nat64,
    'created_by' : IDL.Text,
    'releases' : IDL.Vec(ReleaseView),
    'app_id' : IDL.Text,
    'install_count' : IDL.Nat64,
  });
  const Result_1 = IDL.Variant({ 'Ok' : AppView, 'Err' : IDL.Text });
  const Result_2 = IDL.Variant({ 'Ok' : IDL.Principal, 'Err' : IDL.Text });
  const CreateUserArgs = IDL.Record({
    'metadata' : IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    'canister_id' : IDL.Opt(IDL.Principal),
  });
  const AppBug = IDL.Record({
    'logs' : IDL.Vec(IDL.Text),
    'name' : IDL.Text,
    'canister_id' : IDL.Principal,
    'description' : IDL.Text,
    'version' : IDL.Text,
  });
  const FromUserRecord = IDL.Record({ 'user_id' : IDL.Principal });
  const FromCanisterRecord = IDL.Record({
    'canister_version' : IDL.Opt(IDL.Nat64),
    'canister_id' : IDL.Principal,
  });
  const CanisterChangeOrigin = IDL.Variant({
    'from_user' : FromUserRecord,
    'from_canister' : FromCanisterRecord,
  });
  const CreationRecord = IDL.Record({ 'controllers' : IDL.Vec(IDL.Principal) });
  const CanisterInstallMode = IDL.Variant({
    'reinstall' : IDL.Null,
    'upgrade' : IDL.Null,
    'install' : IDL.Null,
  });
  const CodeDeploymentRecord = IDL.Record({
    'mode' : CanisterInstallMode,
    'module_hash' : IDL.Vec(IDL.Nat8),
  });
  const CanisterChangeDetails = IDL.Variant({
    'creation' : CreationRecord,
    'code_deployment' : CodeDeploymentRecord,
    'controllers_change' : CreationRecord,
    'code_uninstall' : IDL.Null,
  });
  const CanisterChange = IDL.Record({
    'timestamp_nanos' : IDL.Nat64,
    'canister_version' : IDL.Nat64,
    'origin' : CanisterChangeOrigin,
    'details' : CanisterChangeDetails,
  });
  const CanisterInfoResponse = IDL.Record({
    'controllers' : IDL.Vec(IDL.Principal),
    'module_hash' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'recent_changes' : IDL.Vec(CanisterChange),
    'total_num_changes' : IDL.Nat64,
  });
  const Result_3 = IDL.Variant({ 'Ok' : ReleaseView, 'Err' : IDL.Text });
  const CanisterStatusType = IDL.Variant({
    'stopped' : IDL.Null,
    'stopping' : IDL.Null,
    'running' : IDL.Null,
  });
  const DefiniteCanisterSettings = IDL.Record({
    'freezing_threshold' : IDL.Nat,
    'controllers' : IDL.Vec(IDL.Principal),
    'memory_allocation' : IDL.Nat,
    'compute_allocation' : IDL.Nat,
  });
  const QueryStats = IDL.Record({
    'response_payload_bytes_total' : IDL.Nat,
    'num_instructions_total' : IDL.Nat,
    'num_calls_total' : IDL.Nat,
    'request_payload_bytes_total' : IDL.Nat,
  });
  const CanisterStatusResponse = IDL.Record({
    'status' : CanisterStatusType,
    'memory_size' : IDL.Nat,
    'cycles' : IDL.Nat,
    'settings' : DefiniteCanisterSettings,
    'query_stats' : QueryStats,
    'idle_cycles_burned_per_day' : IDL.Nat,
    'module_hash' : IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  const UserCanisterStatus = IDL.Record({
    'version' : IDL.Text,
    'canister_status' : CanisterStatusResponse,
  });
  const UserStatus = IDL.Variant({
    'Unregistered' : IDL.Null,
    'Applications' : IDL.Vec(IDL.Principal),
    'Registered' : IDL.Null,
  });
  const LoadRelease = IDL.Record({ 'total' : IDL.Nat64, 'chunks' : IDL.Nat64 });
  const SystemCanisterStatus = IDL.Record({
    'user_status' : IDL.Nat64,
    'status_at' : IDL.Nat64,
    'version' : IDL.Text,
    'canister_status' : CanisterStatusResponse,
  });
  return IDL.Service({
    'add_release' : IDL.Func([CreateReleaseArgs], [ReleaseView], []),
    'add_user_app' : IDL.Func([IDL.Principal, IDL.Text], [Result], []),
    'clear_bugs' : IDL.Func([IDL.Principal], [], []),
    'create_app' : IDL.Func([CreateAppArgs], [Result_1], []),
    'create_app_canister' : IDL.Func([IDL.Text], [Result_2], []),
    'create_user' : IDL.Func([CreateUserArgs], [UserView], []),
    'deprecate_release' : IDL.Func([IDL.Text, IDL.Vec(IDL.Nat8)], [], []),
    'get_app' : IDL.Func([IDL.Text], [Result_1], ['query']),
    'get_app_version' : IDL.Func(
        [IDL.Principal],
        [IDL.Text],
        ['composite_query'],
      ),
    'get_apps' : IDL.Func([], [IDL.Vec(AppView)], ['query']),
    'get_bugs' : IDL.Func([IDL.Principal], [IDL.Vec(AppBug)], ['query']),
    'get_canister_info' : IDL.Func([IDL.Principal], [CanisterInfoResponse], []),
    'get_canisters' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'get_create_canister_app_cycle' : IDL.Func(
        [],
        [IDL.Nat, IDL.Nat],
        ['query'],
      ),
    'get_latest_release' : IDL.Func([IDL.Text], [Result_3], ['query']),
    'get_release' : IDL.Func([IDL.Vec(IDL.Nat8)], [ReleaseView], ['query']),
    'get_release_by_hash_string' : IDL.Func(
        [IDL.Text],
        [ReleaseView],
        ['query'],
      ),
    'get_states' : IDL.Func([], [UserView], ['query']),
    'get_user_app_status' : IDL.Func([IDL.Principal], [UserCanisterStatus], []),
    'get_user_ids' : IDL.Func([], [IDL.Vec(IDL.Principal)], ['query']),
    'get_user_states' : IDL.Func([], [IDL.Vec(UserView)], ['query']),
    'get_user_status' : IDL.Func([], [UserStatus], ['query']),
    'install_app' : IDL.Func([IDL.Principal, IDL.Text], [Result], []),
    'load_wasm_chunk' : IDL.Func(
        [IDL.Vec(IDL.Nat8), IDL.Vec(IDL.Nat8)],
        [LoadRelease],
        [],
      ),
    'releases' : IDL.Func([IDL.Text], [IDL.Vec(ReleaseView)], ['query']),
    'remove_app' : IDL.Func([IDL.Text], [], []),
    'remove_release' : IDL.Func([IDL.Vec(IDL.Nat8)], [], []),
    'remove_user' : IDL.Func([IDL.Principal], [], []),
    'remove_user_app' : IDL.Func([IDL.Principal], [], []),
    'report_bug' : IDL.Func([AppBug], [], []),
    'status' : IDL.Func([], [SystemCanisterStatus], []),
    'uninstall_app' : IDL.Func([IDL.Principal], [Result], []),
    'update_app' : IDL.Func([CreateAppArgs], [Result_1], []),
    'version' : IDL.Func([], [IDL.Text], ['query']),
  });
};
export const init = ({ IDL }) => { return []; };
