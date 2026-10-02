// A fake Internet Computer replica for local tests: it answers the IC HTTP
// API through globalThis.fetch and signs what a replica signs. Types in
// fake-replica.d.ts.

import { bls12_381 } from "@noble/curves/bls12-381.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { p256 } from "@noble/curves/nist.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { BLS12_381_G2_OID, Cbor, IC_REQUEST_AUTH_DELEGATION_DOMAIN_SEPARATOR, IC_REQUEST_DOMAIN_SEPARATOR, IC_RESPONSE_DOMAIN_SEPARATOR, IC_STATE_ROOT_DOMAIN_SEPARATOR, NodeType, ReplicaRejectCode, hashOfMap, reconstruct, requestIdOf, wrapDER, } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Principal } from "@icp-sdk/core/principal";
// Pages on a mainnet domain are not answered by default.
const getNetworkByHostname = (hostname) => /(^|\.)(ic0\.app|icp0\.io|icp-api\.io)$/.test(hostname) ? "ic" : "local";

export class FakeReplicaReject extends Error {
    constructor(rejectCode, errorCode, message) {
        super(message);
        Object.defineProperty(this, "rejectCode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: rejectCode
        });
        Object.defineProperty(this, "errorCode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: errorCode
        });
        this.name = "FakeReplicaReject";
    }
}
const DEFAULT_HOST = "http://127.0.0.1:4943";

function localPageOrigin() {
    try {
        const origin = globalThis.location
            ?.origin;
        if (!origin)
            return undefined;
        const { protocol, hostname } = new URL(origin);
        return (protocol === "http:" || protocol === "https:") &&
            getNetworkByHostname(hostname) !== "ic"
            ? origin
            : undefined;
    }
    catch {
        return undefined;
    }
}

const IC_API_PATH = /^\/api\/v\d+\/(?:status|(?:canister|subnet)\/[^/]+\/(?:query|call|read_state))$/;

function urlOf(input) {
    const raw = input instanceof Request ? input.url : String(input);
    let base;
    try {
        base = globalThis.location?.href;
    }
    catch {
        base = undefined;
    }
    try {
        return new URL(raw, base);
    }
    catch {
        return undefined;
    }
}

const FAKE_REPLICA_FETCH = Symbol.for("test-support/fakeReplica");
const linkOf = (fetch) => typeof fetch === "function"
    ? fetch[FAKE_REPLICA_FETCH]
    : undefined;

function liveFetchUnder(link) {
    let fetch = link.previous;
    for (let under = linkOf(fetch); under?.restored; under = linkOf(fetch)) {
        fetch = under.previous;
    }
    return fetch;
}
const encoder = new TextEncoder();
const utf8 = (text) => new Uint8Array(encoder.encode(text));
function compareBytes(a, b) {
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
        if (a[i] !== b[i])
            return a[i] - b[i];
    }
    return a.length - b.length;
}
function toHashTree(node) {
    if (!Array.isArray(node)) {
        return [NodeType.Leaf, node];
    }
    const labelled = node
        .map(([label, child]) => ({
        label: typeof label === "string" ? utf8(label) : label,
        child,
    }))
        .sort((a, b) => compareBytes(a.label, b.label))
        .map(({ label, child }) => [NodeType.Labeled, label, toHashTree(child)]);
    return fork(labelled);
}
function fork(nodes) {
    if (nodes.length === 0)
        return [NodeType.Empty];
    if (nodes.length === 1)
        return nodes[0];
    const middle = Math.ceil(nodes.length / 2);
    return [
        NodeType.Fork,
        fork(nodes.slice(0, middle)),
        fork(nodes.slice(middle)),
    ];
}
function leb128(value) {
    const out = [];
    let rest = value;
    do {
        let byte = Number(rest & 0x7fn);
        rest >>= 7n;
        if (rest !== 0n)
            byte |= 0x80;
        out.push(byte);
    } while (rest !== 0n);
    return new Uint8Array(out);
}
function concat(...parts) {
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}
const nowNanos = () => BigInt(Date.now()) * 1000000n;
function cborResponse(body, status = 200) {
    return new Response(Cbor.encode(body), {
        status,
        headers: { "content-type": "application/cbor" },
    });
}
const hex = (text) => Uint8Array.from(text.match(/../g) ?? [], (byte) => parseInt(byte, 16));
const ED25519_SPKI_PREFIX = hex("302a300506032b6570032100");
const P256_SPKI_PREFIX = hex("3059301306072a8648ce3d020106082a8648ce3d030107034200");
const SECP256K1_SPKI_PREFIX = hex("3056301006072a8648ce3d020106052b8104000a034200");
const startsWith = (bytes, prefix) => bytes.length > prefix.length && prefix.every((byte, i) => bytes[i] === byte);

function verifySignature(publicKey, signature, message) {
    try {
        if (startsWith(publicKey, ED25519_SPKI_PREFIX)) {
            const raw = publicKey.subarray(ED25519_SPKI_PREFIX.length);
            return ed25519.verify(signature, message, raw);
        }
        if (startsWith(publicKey, P256_SPKI_PREFIX)) {
            const raw = publicKey.subarray(P256_SPKI_PREFIX.length);
            return p256.verify(signature, message, raw, { lowS: false });
        }
        if (startsWith(publicKey, SECP256K1_SPKI_PREFIX)) {
            const raw = publicKey.subarray(SECP256K1_SPKI_PREFIX.length);
            return secp256k1.verify(signature, message, raw);
        }
    }
    catch {
        return false;
    }
    return undefined;
}
const messageOf = (error) => error instanceof Error ? error.message : String(error);

export function installFakeReplica(options = {}) {
    const host = new URL(options.host ?? localPageOrigin() ?? DEFAULT_HOST).origin;
    const canisters = { ...options.canisters };
    const requests = [];
    const installed = Object.keys(canisters).map((id) => {
        try {
            return Principal.fromText(id);
        }
        catch {
            throw new Error(`installFakeReplica: "${id}" in \`canisters\` is not a canister ID`);
        }
    });
    const secretKey = bls12_381.utils.randomSecretKey();
    const rootKey = wrapDER(bls12_381.shortSignatures.getPublicKey(secretKey).toBytes(), BLS12_381_G2_OID);
    const subnetId = Principal.selfAuthenticating(rootKey);
    const node = Ed25519KeyIdentity.generate();
    const nodeKey = new Uint8Array(node.getPublicKey().toDer());
    const nodeId = Principal.selfAuthenticating(nodeKey);
    async function certify(entries) {
        const tree = toHashTree([...entries, ["time", leb128(nowNanos())]]);
        const rootHash = await reconstruct(tree);
        const message = bls12_381.shortSignatures.hash(concat(IC_STATE_ROOT_DOMAIN_SEPARATOR, rootHash));
        const signature = bls12_381.shortSignatures.sign(message, secretKey);
        return Cbor.encode({ tree, signature: signature.toBytes() });
    }
    
    function authenticate(envelope, canisterId) {
        const sender = Principal.fromUint8Array(envelope.content.sender);
        const { sender_pubkey, sender_sig, sender_delegation = [] } = envelope;
        if (sender.isAnonymous()) {
            return sender_pubkey || sender_sig
                ? "an anonymous request carries a signature"
                : sender;
        }
        if (!sender_pubkey || !sender_sig) {
            return "the request is not signed";
        }
        if (Principal.selfAuthenticating(sender_pubkey).toText() !== sender.toText()) {
            return "the sender is not the principal of sender_pubkey";
        }
        const now = nowNanos();
        let signer = sender_pubkey;
        for (const { delegation, signature } of sender_delegation) {
            const challenge = concat(IC_REQUEST_AUTH_DELEGATION_DOMAIN_SEPARATOR, requestIdOf(delegation));
            const signed = verifySignature(signer, signature, challenge);
            if (signed === undefined) {
                return "a delegation is signed by a kind of key the fake replica cannot check";
            }
            if (!signed) {
                return "a delegation is not signed by the key before it";
            }
            if (BigInt(delegation.expiration) <= now) {
                return "a delegation has expired";
            }
            if (delegation.targets &&
                !delegation.targets.some((target) => Principal.fromUint8Array(target).toText() === canisterId)) {
                return `a delegation does not allow calls to ${canisterId}`;
            }
            signer = delegation.pubkey;
        }
        const message = concat(IC_REQUEST_DOMAIN_SEPARATOR, requestIdOf(envelope.content));
        const signed = verifySignature(signer, sender_sig, message);
        if (signed === undefined) {
            return "the request is signed by a kind of key the fake replica cannot check";
        }
        if (!signed) {
            return "sender_sig is not the signing key's signature over the request";
        }
        return sender;
    }
    
    async function execute(kind, canisterId, method, arg, caller) {
        const reject = (code, errorCode, message) => ({ reject: { code, errorCode, message } });
        const canister = Object.prototype.hasOwnProperty.call(canisters, canisterId)
            ? canisters[canisterId]
            : undefined;
        if (!canister) {
            return reject(ReplicaRejectCode.DestinationInvalid, "IC0301", `fake replica: no canister is installed at ${canisterId}`);
        }
        const handler = kind === "query" ? canister.query : canister.update;
        if (!handler) {
            return reject(ReplicaRejectCode.DestinationInvalid, "IC0536", `fake replica: canister ${canisterId} answers no ${kind === "query" ? "queries" : "update calls"}`);
        }
        try {
            return {
                reply: new Uint8Array(await handler.call(canister, method, arg, { caller })),
            };
        }
        catch (error) {
            if (error instanceof FakeReplicaReject) {
                return reject(error.rejectCode, error.errorCode, error.message);
            }
            return reject(ReplicaRejectCode.CanisterError, "IC0503", `Canister ${canisterId} trapped: ${messageOf(error)}`);
        }
    }
    async function handleQuery(canisterId, envelope, caller) {
        const { method_name = "", arg = new Uint8Array() } = envelope.content;
        requests.push({
            endpoint: "query",
            canisterId,
            methodName: method_name,
            caller: caller.toText(),
        });
        const outcome = await execute("query", canisterId, method_name, arg, caller);
        const timestamp = nowNanos();
        const request_id = requestIdOf(envelope.content);
        const body = "reply" in outcome
            ? { status: "replied", reply: { arg: outcome.reply } }
            : {
                status: "rejected",
                reject_code: outcome.reject.code,
                reject_message: outcome.reject.message,
                error_code: outcome.reject.errorCode,
            };
        const hash = hashOfMap({ ...body, timestamp, request_id });
        const signature = await node.sign(concat(IC_RESPONSE_DOMAIN_SEPARATOR, hash));
        return cborResponse({
            ...body,
            signatures: [
                {
                    timestamp,
                    signature: new Uint8Array(signature),
                    identity: nodeId.toUint8Array(),
                },
            ],
        });
    }
    async function handleCall(canisterId, envelope, caller) {
        const { method_name = "", arg = new Uint8Array() } = envelope.content;
        requests.push({
            endpoint: "call",
            canisterId,
            methodName: method_name,
            caller: caller.toText(),
        });
        const outcome = await execute("update", canisterId, method_name, arg, caller);
        const status = "reply" in outcome
            ? [
                ["status", utf8("replied")],
                ["reply", outcome.reply],
            ]
            : [
                ["status", utf8("rejected")],
                ["reject_code", leb128(BigInt(outcome.reject.code))],
                ["reject_message", utf8(outcome.reject.message)],
                ["error_code", utf8(outcome.reject.errorCode)],
            ];
        const certificate = await certify([
            ["request_status", [[requestIdOf(envelope.content), status]]],
        ]);
        return cborResponse({ status: "replied", certificate });
    }
    async function handleReadState(canisterId) {
        requests.push({ endpoint: "read_state", canisterId });
        const inSubnet = [...installed, Principal.fromText(canisterId)]
            .map((id) => id.toUint8Array())
            .sort(compareBytes)
            .filter((id, i, ids) => i === 0 || compareBytes(ids[i - 1], id) !== 0);
        const certificate = await certify([
            [
                "subnet",
                [
                    [
                        subnetId.toUint8Array(),
                        [
                            ["canister_ranges", Cbor.encode(inSubnet.map((id) => [id, id]))],
                            ["node", [[nodeId.toUint8Array(), [["public_key", nodeKey]]]]],
                        ],
                    ],
                ],
            ],
        ]);
        return cborResponse({ certificate });
    }
    const link = {
        previous: globalThis.fetch,
        restored: false,
    };
    const misrouted = new Set();
    const fakeFetch = async (input, init) => {
        const next = liveFetchUnder(link);
        const url = urlOf(input);
        if (!url || !IC_API_PATH.test(url.pathname))
            return next(input, init);
        if (url.origin !== host) {
            if (linkOf(next))
                return next(input, init);
            const message = `fake replica: no route to ${url.origin}. The fake answers ${host}; ` +
                `build the agent with \`agentOptions: { host: replica.host }\`, ` +
                `or install the fake with \`host: "${url.origin}"\``;
            if (!misrouted.has(url.origin)) {
                misrouted.add(url.origin);
                console.error(message);
            }
            throw new TypeError(message);
        }
        if (url.pathname === "/api/v2/status") {
            requests.push({ endpoint: "status" });
            return cborResponse({
                ic_api_version: "0.18.0",
                impl_version: "fake",
                replica_health_status: "healthy",
                root_key: rootKey,
            });
        }
        const match = /^\/api\/v[234]\/canister\/([^/]+)\/(query|call|read_state)$/.exec(url.pathname);
        if (!match) {
            return new Response(`fake replica: no endpoint ${url.pathname}`, {
                status: 404,
            });
        }
        const [, effectiveCanisterId, path] = match;
        const endpoint = path;
        try {
            const body = new Uint8Array(await new Response(input instanceof Request ? input.body : init?.body).arrayBuffer());
            const envelope = Cbor.decode(body);
            const canisterId = envelope.content.canister_id
                ? Principal.fromUint8Array(envelope.content.canister_id).toText()
                : effectiveCanisterId;
            const caller = authenticate(envelope, canisterId);
            if (typeof caller === "string") {
                requests.push({
                    endpoint,
                    canisterId,
                    methodName: envelope.content.method_name,
                    refused: caller,
                });
                return new Response(`fake replica: ${caller}`, { status: 400 });
            }
            if (endpoint === "query") {
                return await handleQuery(canisterId, envelope, caller);
            }
            if (endpoint === "call") {
                return await handleCall(canisterId, envelope, caller);
            }
            return await handleReadState(effectiveCanisterId);
        }
        catch (error) {
            console.error("fake replica:", error);
            return new Response(`fake replica: the request failed: ${messageOf(error)}`, { status: 500 });
        }
    };
    const fetch = Object.assign(fakeFetch, {
        [FAKE_REPLICA_FETCH]: link,
    });
    globalThis.fetch = fetch;
    return {
        host,
        rootKey,
        requests,
        restore() {
            if (link.restored)
                return;
            link.restored = true;
            const above = linkOf(globalThis.fetch);
            if (globalThis.fetch !== fetch && above && !above.restored)
                return;
            globalThis.fetch = liveFetchUnder(link);
        },
    };
}