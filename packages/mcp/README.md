# @ic-reactor/mcp

An MCP server that gives an AI agent any Internet Computer canister's methods
as tools. Name a canister, and Claude Code, Cursor or any other MCP client gets
one tool per method, with an input schema built from the canister's Candid.
Queries run at once. An update is sent only after you approve that exact call
in the client.

> **Not published.** The package is `private` until its npm name is settled.
> Run it from this repository:
>
> ```sh
> pnpm install
> pnpm --filter @ic-reactor/mcp build
> node packages/mcp/dist/cli.js --help
> ```

It is built on ic-reactor and Meant: the canister's interface is read from its
certified `candid:service` metadata and compiled with `@meantjs/cli`, the
arguments and replies are checked and encoded by `@meantjs/schema`, and calls
go through an `@ic-reactor/core` client, which verifies every certificate and
says whether a failed write may have run.

## Add it to a client

Claude Code, for the ICP ledger:

```sh
claude mcp add icp -- node /path/to/ic-reactor/packages/mcp/dist/cli.js \
  --canister ledger=ryjl3-tyaaa-aaaaa-aaaba-cai
```

Cursor (`.cursor/mcp.json`) and other clients that take a JSON entry:

```json
{
  "mcpServers": {
    "icp": {
      "command": "node",
      "args": [
        "/path/to/ic-reactor/packages/mcp/dist/cli.js",
        "--canister",
        "ledger=ryjl3-tyaaa-aaaaa-aaaba-cai"
      ]
    }
  }
}
```

Without `--identity` the server calls as the anonymous principal: every query
works and no update is sent. To send updates, give it a key (see below).

## Tools

| Tool              | What it does                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `whoami`          | The principal calls are signed as, the network, whether the client can show the approval form, the listed canisters                   |
| `list_methods`    | A canister's methods and their Candid signatures, where the interface came from, and whether updates can be sent                      |
| `describe_method` | One method's Candid (the method and every type it uses), its doc comment, and the JSON Schema of its arguments                        |
| `query`           | Runs a query method of any canister; `certified: true` makes it a replicated call, as the anonymous principal, with a certified reply |
| `call`            | Sends an update to a listed canister once you approve it; a query method is run as a query                                            |
| `<name>_<method>` | One per method of each `--canister`, such as `ledger_icrc1_transfer`, with the method's own input schema                              |

`call` and the update tools are listed only when an update can be sent: the
server has a key, the client can show a form, and a canister is listed.

## Arguments and replies

Tool arguments and replies are JSON. Numbers that do not fit a JSON number are
strings:

| Candid                               | JSON                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `nat`, `int`, `nat64`, `int64`       | a decimal string, `"150000000"`; a safe integer is also read as input              |
| `nat8` to `nat32`, `int8` to `int32` | a number                                                                           |
| `float32`, `float64`                 | a number, or `"NaN"`, `"Infinity"`, `"-Infinity"`, `"-0"`                          |
| `text`, `bool`, `null`               | a string, `true`/`false`, `null`                                                   |
| `principal`, `service`               | principal text, `"ryjl3-tyaaa-aaaaa-aaaba-cai"`                                    |
| `blob` (`vec nat8`)                  | lower-case hex; as input also `{ "utf8": "text" }`                                 |
| `opt T`                              | `null` or the value; `{ "some": value }` when `T` itself admits `null`             |
| `vec T`, `record`, tuple             | an array, an object, an array                                                      |
| `variant`                            | `{ "tag": "Name", "value": payload }`, or `{ "tag": "Name" }` for a `null` payload |
| `func`                               | `{ "principal": "…", "method": "…" }`                                              |

A method that takes one record gets that record's fields as its tool's
arguments, unless a field is named `__proto__`, a key the MCP SDK drops from
the top level of a tool call's arguments. One that takes anything else, or
such a record, gets `arg0`, `arg1`, …. A method whose
one result is an `Ok`/`Err` variant answers with the `Ok` payload, and an `Err`
comes back as a tool error that carries its payload.

## Updates and approval

An update (or a oneway call) is sent only when all of these hold, and a
refusal says which one did not:

1. The server has a key: `--identity <pem file>`.
2. The canister is listed with `--canister`. Queries reach any canister,
   updates only the ones you named.
3. Its interface is certified metadata, or a `.did` you gave with `--did`.
   An interface read through the uncertified `__get_candid_interface_tmp_hack`
   query is used for reads only: it is one replica's unproven answer.
4. The client can show a form (MCP form elicitation), and you tick
   "Send this call" and accept.

The form shows the canister, the method, the principal that signs, the
network, the arguments as Candid text (with invisible and bidirectional
characters escaped), the size and sha256 of the encoded arguments, and where
the interface came from, in a code fence, so that a client that renders the
form as Markdown shows the call as written. Arguments too long to show (over
20,000 characters of Candid), or a method name over 200 characters, are
refused, never cut. The server confirms the canister's module
hash (or reads the `.did` file again) before it asks you and again after you
approve, and sends nothing if the canister was upgraded in between. Declining,
closing the form, ten minutes without an answer, or a client error all mean
nothing is sent. One approval is asked at a time.

A certified read (`query` with `certified: true`) is a replicated call, which
the IC runs as whatever the canister's module exports under that name, while
the `query` in its interface is only the canister's own word. So it is made as
the anonymous principal, never with your key: a method a canister calls a
query, but runs as an update, cannot act as you. A method that answers per
caller then answers for the anonymous principal; without `certified` a query
is signed with your key, and the IC runs only query methods that way. The
reply is read with the interface of the module installed now (its hash is
confirmed first), and never with one read through the tmp hack: a certified
read of such a canister is refused, and `certified: false` still reads it.

Claude Code shows the form in a dialog. `claude -p` cancels every form unless
an `Elicitation` hook answers it, so a headless run sends no update unless you
wrote a hook that approves.

## A key

`--identity <file>` takes an Ed25519 or secp256k1 private key in PEM form, such
as `icp identity export <name>` or `dfx identity export <name>` prints. The
file must be readable by its owner only (`chmod 600`); the server refuses one
that other users can read. Without it the server calls as the anonymous
principal, which ic-reactor refuses to send writes as. The server never makes a
key.

## Options

```
--canister <name>=<id>     A canister that gets typed tools and takes updates,
                           such as ledger=ryjl3-tyaaa-aaaaa-aaaba-cai. A bare
                           <id> is named after its first five characters.
--did <name or id>=<path>  Read that canister's interface from this .did file
                           instead of the network.
--identity <pem file>      Sign calls with this key (chmod 600).
--network <ic|local|url>   ic (mainnet, the default), local
                           (http://127.0.0.1:8000), or a replica's URL.
--root-key <hex>           The root key (DER, hex) of a --network <url> that
                           is not on this machine.
```

A root key is fetched only from a replica on this machine (`local`,
`localhost`, `127.0.0.0/8`, `[::1]`). Mainnet's key is built into the agent,
and a remote replica's must be given with `--root-key`.

## Limits

- A `.did` over 256 KiB, a service with more than 1,000 methods, or a compile
  over 2 seconds is refused; the compiler runs in a worker thread.
- A tool's input schema is cut at about 64,000 characters, names and
  descriptions included (the NNS governance canister's largest, for
  `manage_neuron`, is 51,190), and says it was cut; `describe_method` shows
  the whole Candid, and the arguments are still checked in full. The typed
  tools of one `tools/list` stop at 1,000,000 characters: a method past that,
  or one whose name is over 200 characters, gets no tool of its own, and
  `query` and `call` still reach it.
- A tool result is cut at 60,000 characters, with a note that it was cut.
- A read waits 60 seconds for its answer, and an approved update 6 minutes;
  an update that gets no answer in time may still have run, and its result
  says so.
- Interfaces are cached by module hash and read again a minute after they
  were last confirmed. When a listed canister's interface changes, the server
  tells the client to list tools again.

## What the agent sees, and what it does not

Names in a canister's interface (methods, fields, types) are the canister's
own text and reach the model in tool names, descriptions and schemas. A
method's doc comment, which is free text, appears only in `describe_method`'s
result, labelled as written by the canister's authors, and never in a tool
description. The form is the safeguard for writes: an agent misled by such
text can still only propose a call, and you read the call itself before it is
sent.

## License

MIT
