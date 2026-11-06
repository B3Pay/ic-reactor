// The tools every server has, whichever canisters it lists. A listed
// canister's methods get their own tools besides these (server.ts).
import type { Tool } from "@modelcontextprotocol/server"

const CANISTER = {
  type: "string",
  description:
    "A canister id such as ryjl3-tyaaa-aaaaa-aaaba-cai, or the name of a canister this server lists (whoami lists them)",
}
const METHOD = {
  type: "string",
  description: "The method's name, as list_methods prints it",
}
const ARGS = {
  type: "object",
  description:
    "The method's arguments, as describe_method's input schema describes them: {} for none, the fields of a lone record argument, else arg0, arg1, …",
}

const READ = { readOnlyHint: true, openWorldHint: true } as const

export const WHOAMI: Tool = {
  name: "whoami",
  title: "Who calls, and where",
  description:
    "The principal this server signs calls as, the network, whether this client can approve updates, and the canisters that take updates.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, openWorldHint: false },
}

export const LIST_METHODS: Tool = {
  name: "list_methods",
  title: "List a canister's methods",
  description:
    "Lists a canister's methods with their Candid signatures, read from the canister's certified candid:service metadata, and says whether updates to it can be sent.",
  inputSchema: {
    type: "object",
    properties: { canister: CANISTER },
    required: ["canister"],
    additionalProperties: false,
  },
  annotations: READ,
}

export const DESCRIBE_METHOD: Tool = {
  name: "describe_method",
  title: "Describe a method",
  description:
    "Shows one method's Candid (the method and every type it uses), its doc comment, and the JSON Schema of the args that query and call take for it.",
  inputSchema: {
    type: "object",
    properties: { canister: CANISTER, method: METHOD },
    required: ["canister", "method"],
    additionalProperties: false,
  },
  annotations: READ,
}

export const QUERY: Tool = {
  name: "query",
  title: "Run a query method",
  description:
    "Runs a query method of any canister and returns the reply as JSON. A query changes nothing. With certified: true the reply is certified by the subnet, at the cost of a slower replicated call. Update methods are refused here: use call.",
  inputSchema: {
    type: "object",
    properties: {
      canister: CANISTER,
      method: METHOD,
      args: ARGS,
      certified: {
        type: "boolean",
        description:
          "Whether the reply must be certified (a replicated call; not for composite queries). Default false.",
      },
    },
    required: ["canister", "method"],
    additionalProperties: false,
  },
  annotations: READ,
}

export const CALL: Tool = {
  name: "call",
  title: "Send an update",
  description:
    "Sends an update call once the person approves that exact call in the client. If they decline, nothing is sent: do not send it again unless they ask. Only canisters this server lists take updates. A query method is run as a query, with no approval.",
  inputSchema: {
    type: "object",
    properties: { canister: CANISTER, method: METHOD, args: ARGS },
    required: ["canister", "method"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
}

/** Every generic tool's name: a typed tool never takes one. */
export const GENERIC_NAMES = [
  WHOAMI.name,
  LIST_METHODS.name,
  DESCRIBE_METHOD.name,
  QUERY.name,
  CALL.name,
]

/** What the model is told about the server as a whole. */
export const INSTRUCTIONS = `Tools for Internet Computer canisters, by ic-reactor.

- list_methods and describe_method show a canister's interface. query runs a query method of any canister; it changes nothing. A listed canister's methods also have their own tools.
- An update is sent only after the person approves that exact call in this client. If they decline or close the form, nothing was sent: do not send it again unless they ask.
- An update that fails saying it "may have run" can have taken effect: check the canister's state before sending it again.
- Arguments are JSON: nat, int, nat64 and int64 as decimal strings ("1000000"), smaller integers as numbers, principals as text, blobs as hex or {"utf8": "text"}, an opt as null or its value, a variant as {"tag": "Name", "value": payload}, a record as an object. describe_method gives each method's JSON Schema.`
