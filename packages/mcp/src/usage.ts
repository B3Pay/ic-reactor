// What the command line takes, and the error for a command line it refuses.

/** A command line the server refuses to start with: printed to stderr, exit status 2. */
export class UsageError extends Error {
  override name = "UsageError"
}

export const USAGE = `ic-reactor-mcp: an MCP server for Internet Computer canisters

Usage: ic-reactor-mcp [options]

Every canister's methods can be read with the list_methods, describe_method
and query tools. A canister named with --canister also gets one tool per
method, and only such a canister takes updates: each one is sent after the
person approves that exact call in the MCP client.

Options:
  --canister <name>=<id>   A canister to give tools and take updates, such as
                           ledger=ryjl3-tyaaa-aaaaa-aaaba-cai. A bare <id> is
                           named after its first five characters. Repeatable.
  --did <name or id>=<path>
                           Read that canister's interface from this .did file
                           instead of the network. Repeatable.
  --identity <pem file>    Sign calls with this Ed25519 or secp256k1 key, such
                           as \`icp identity export\` prints. The file must be
                           readable by its owner only (chmod 600). Without it
                           the server calls as the anonymous principal and
                           sends no update.
  --network <ic|local|url> The network: ic (mainnet, the default), local
                           (http://127.0.0.1:8000), or a replica's URL.
  --root-key <hex>         The root key of a --network <url> that is not on
                           this machine (DER, hex). A remote replica's key is
                           never fetched from it.
  --help                   Print this and exit.
  --version                Print the version and exit.

Example, in an MCP client's configuration:
  "command": "ic-reactor-mcp",
  "args": ["--canister", "ledger=ryjl3-tyaaa-aaaaa-aaaba-cai"]
`
