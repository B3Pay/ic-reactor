/**
 * IC Reactor Codec Demo
 *
 * This example demonstrates the automatic type transformation features
 * of IC Reactor v3. The DisplayReactor provides bidirectional transformations
 * between:
 *
 * - **Candid Format** (raw backend types): bigint, Principal, Uint8Array, etc.
 * - **Display Format** (user-friendly types): string representations for easy UI display
 *
 * Key Features Demonstrated:
 * 1. Reactor vs DisplayReactor comparison
 * 2. Automatic bigint → string transformations
 * 3. Automatic Result { Ok, Err } unwrapping
 * 4. Manual codec access for transformations
 */
import {
  ClientManager,
  Reactor,
  DisplayReactor,
  DisplayOf,
  CanisterError,
} from "@ic-reactor/core"
import { Principal } from "@icp-sdk/core/principal"
import { QueryClient } from "@tanstack/query-core"
import { idlFactory, TransferArg, type Ledger } from "./declarations/ledger"
import "./style.css"
import { Actor } from "@icp-sdk/core/agent"

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

const queryClient = new QueryClient()

const clientManager = new ClientManager({
  queryClient,
})

const ledgerCanisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

// Create DisplayReactor instances for each token
// DisplayReactor automatically transforms Candid types to Display types
const displayReactors: Record<string, DisplayReactor<Ledger>> = {
  ICP: new DisplayReactor<Ledger>({
    clientManager,
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory,
    name: "ICP",
  }),
  ckBTC: new DisplayReactor<Ledger>({
    clientManager,
    canisterId: "mxzaz-hqaaa-aaaar-qaada-cai",
    idlFactory,
    name: "ckBTC",
  }),
  ckETH: new DisplayReactor<Ledger>({
    clientManager,
    canisterId: "ss2fx-dyaaa-aaaar-qacoq-cai",
    idlFactory,
    name: "ckETH",
  }),
  ckUSDT: new DisplayReactor<Ledger>({
    clientManager,
    canisterId: "cngnf-vqaaa-aaaar-qag4q-cai",
    idlFactory,
    name: "ckUSDT",
  }),
  ckUSDC: new DisplayReactor<Ledger>({
    clientManager,
    canisterId: "xevnm-gaaaa-aaaar-qafnq-cai",
    idlFactory,
    name: "ckUSDC",
  }),
}

let activeCanisterId = ledgerCanisterId

// ═══════════════════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════

const candidOutput = document.querySelector<HTMLPreElement>("#candid-output")!
const displayOutput = document.querySelector<HTMLPreElement>("#display-output")!
const tokenSelect = document.querySelector<HTMLSelectElement>("#token-select")!
const tokenNameEl = document.querySelector<HTMLSpanElement>("#token-name")!
const tokenSymbolEl = document.querySelector<HTMLSpanElement>("#token-symbol")!
const tokenDecimalsEl =
  document.querySelector<HTMLSpanElement>("#token-decimals")!
const totalSupplyEl = document.querySelector<HTMLSpanElement>("#total-supply")!
const principalInput =
  document.querySelector<HTMLInputElement>("#principal-input")!
const amountInput = document.querySelector<HTMLInputElement>("#amount-input")!
const encodedResult = document.querySelector<HTMLPreElement>("#encoded-result")!
const simulateResultBtn = document.querySelector<HTMLButtonElement>(
  "#simulate-result-btn"
)!
const resultDemoOutput = document.querySelector<HTMLPreElement>(
  "#result-demo-output"
)!

// ═══════════════════════════════════════════════════════════════════════════
// CODEC DEMONSTRATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Demonstrates the difference between Reactor and DisplayReactor
 * by comparing their output for the same canister calls.
 */
async function demonstrateTransformations() {
  try {
    candidOutput.textContent = "Loading raw Candid data..."
    displayOutput.textContent = "Loading transformed Display data..."

    const actorName = getActorNameByCanisterId(activeCanisterId)

    // Get the DisplayReactor (transforms to Display types)
    const displayReactor = displayReactors[actorName]
    if (!displayReactor) {
      throw new Error(`DisplayReactor not found for ${actorName}`)
    }

    // Create a raw Reactor for comparison (returns Candid types)
    const rawReactor = new Reactor<Ledger>({
      clientManager,
      canisterId: activeCanisterId,
      idlFactory,
      name: `${actorName}-raw`,
    })

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Fetch data using RAW Reactor (Candid types)
    // ═══════════════════════════════════════════════════════════════════════
    const [rawName, rawSymbol, rawDecimals, rawFee, rawTotalSupply] =
      await Promise.all([
        rawReactor.callMethod({ functionName: "icrc1_name" }),
        rawReactor.callMethod({ functionName: "icrc1_symbol" }),
        rawReactor.callMethod({ functionName: "icrc1_decimals" }),
        rawReactor.callMethod({ functionName: "icrc1_fee" }),
        rawReactor.callMethod({ functionName: "icrc1_total_supply" }),
      ])

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Fetch data using DisplayReactor (Display types)
    // ═══════════════════════════════════════════════════════════════════════
    const [
      displayName,
      displaySymbol,
      displayDecimals,
      displayFee,
      displayTotalSupply,
    ] = await Promise.all([
      displayReactor.callMethod({ functionName: "icrc1_name" }),
      displayReactor.callMethod({ functionName: "icrc1_symbol" }),
      displayReactor.callMethod({ functionName: "icrc1_decimals" }),
      displayReactor.callMethod({ functionName: "icrc1_fee" }),
      displayReactor.callMethod({ functionName: "icrc1_total_supply" }),
    ])

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Display the comparison
    // ═══════════════════════════════════════════════════════════════════════

    const rawData = {
      name: rawName,
      symbol: rawSymbol,
      decimals: rawDecimals,
      fee: rawFee,
      totalSupply: rawTotalSupply,
      _note: "Raw Candid types from Reactor",
      _types: {
        fee: typeof rawFee,
        totalSupply: typeof rawTotalSupply,
      },
    }

    const displayData = {
      name: displayName,
      symbol: displaySymbol,
      decimals: displayDecimals,
      fee: displayFee,
      totalSupply: displayTotalSupply,
      _note: "Display types from DisplayReactor",
      _types: {
        fee: typeof displayFee,
        totalSupply: typeof displayTotalSupply,
      },
    }

    candidOutput.textContent = formatObject(rawData, "candid")
    displayOutput.textContent = formatObject(displayData, "display")
  } catch (error) {
    console.error("Transformation demo error:", error)
    candidOutput.textContent = `Error: ${error}`
    displayOutput.textContent = `Error: ${error}`
  }
}

/**
 * Helper to get actor name by canister ID
 */
function getActorNameByCanisterId(canisterId: string): string {
  const canisterMap: Record<string, string> = {
    "ryjl3-tyaaa-aaaaa-aaaba-cai": "ICP",
    "mxzaz-hqaaa-aaaar-qaada-cai": "ckBTC",
    "ss2fx-dyaaa-aaaar-qacoq-cai": "ckETH",
    "cngnf-vqaaa-aaaar-qag4q-cai": "ckUSDT",
    "xevnm-gaaaa-aaaar-qafnq-cai": "ckUSDC",
  }
  return canisterMap[canisterId] || canisterId
}

/**
 * Fetches and displays token info using DisplayReactor.
 * All bigint values are automatically converted to strings.
 */
async function fetchTokenInfo(canisterId: string) {
  try {
    const actorName = getActorNameByCanisterId(canisterId)
    const reactor =
      displayReactors[actorName] ||
      (displayReactors[actorName] = new DisplayReactor<Ledger>({
        clientManager,
        idlFactory,
        canisterId,
        name: actorName,
      }))

    activeCanisterId = canisterId

    // Set loading states
    tokenNameEl.textContent = "Loading..."
    tokenSymbolEl.textContent = "Loading..."
    tokenDecimalsEl.textContent = "Loading..."
    totalSupplyEl.textContent = "Loading..."

    // Fetch data with DisplayReactor
    // Results are automatically transformed to Display format
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      reactor.callMethod({ functionName: "icrc1_name" }),
      reactor.callMethod({ functionName: "icrc1_symbol" }),
      reactor.callMethod({ functionName: "icrc1_decimals" }),
      reactor.callMethod({ functionName: "icrc1_total_supply" }),
    ])

    // totalSupply is automatically a string!
    // This is handled by DisplayReactor specifically for UI compatibility (form inputs/JSON),
    // and it's performantly converted back to bigint with zero precision loss before canister calls.
    // Without DisplayReactor, it would be bigint which can't display directly

    tokenNameEl.textContent = name as string
    tokenSymbolEl.textContent = symbol as string
    tokenDecimalsEl.textContent = String(decimals)

    // Format the total supply with proper decimals
    const supplyValue =
      typeof totalSupply === "string"
        ? parseFloat(totalSupply)
        : Number(totalSupply)
    const formattedSupply = formatLargeNumber(supplyValue, Number(decimals))
    totalSupplyEl.textContent = `${formattedSupply} ${symbol}`

    // Also update the transformation demo
    await updateTransformationDemo()

    console.log(`Token data loaded for canister: ${activeCanisterId}`)
  } catch (error) {
    console.error("Failed to fetch token info:", error)
    tokenNameEl.textContent = "Error"
    tokenSymbolEl.textContent = "Error"
    tokenDecimalsEl.textContent = "Error"
    totalSupplyEl.textContent = "Error"
  }
}

/**
 * Updates the transformation demo with real data from the selected token.
 */
async function updateTransformationDemo() {
  await demonstrateTransformations()
}

/**
 * Demonstrates manual codec encoding (Display → Candid) with ICRC-1 TransferArg.
 */
function handleEncode() {
  try {
    const principalText = principalInput.value || "aaaaa-aa"
    const amountText = amountInput.value || "100000000"

    const subaccountToggle =
      document.querySelector<HTMLInputElement>("#subaccount-toggle")!
    const subaccountInput =
      document.querySelector<HTMLInputElement>("#subaccount-input")!
    const feeToggle = document.querySelector<HTMLInputElement>("#fee-toggle")!
    const feeInput = document.querySelector<HTMLInputElement>("#fee-input")!
    const memoToggle = document.querySelector<HTMLInputElement>("#memo-toggle")!
    const memoInput = document.querySelector<HTMLInputElement>("#memo-input")!

    const displayArgsEl =
      document.querySelector<HTMLPreElement>("#display-args")!
    const candidArgsEl = document.querySelector<HTMLPreElement>("#candid-args")!

    // ═══════════════════════════════════════════════════════════════════════
    // Step 1: Get the codec from the DisplayReactor
    // ═══════════════════════════════════════════════════════════════════════

    const reactor = displayReactors[getActorNameByCanisterId(activeCanisterId)]
    if (!reactor) {
      encodedResult.textContent = "Error: Reactor not found"
      return
    }

    const transferCodec = reactor.getCodec("icrc1_transfer")
    if (!transferCodec) {
      encodedResult.textContent = "Error: Transfer codec not found"
      return
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Step 2: Build Display Format (user-friendly)
    // ═══════════════════════════════════════════════════════════════════════

    const subaccountHex = subaccountToggle.checked
      ? (subaccountInput.value as `0x${string}`)
      : null

    const displayTransferArg: DisplayOf<TransferArg> = {
      to: {
        owner: principalText,
        subaccount: subaccountHex,
      },
      amount: amountText,
      fee: feeToggle.checked ? feeInput.value : null,
      memo: memoToggle.checked ? (memoInput.value as `0x${string}`) : null,
      from_subaccount: null,
      created_at_time: null,
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Step 3: Transform Display → Candid using the codec
    // ═══════════════════════════════════════════════════════════════════════

    const candidTransferArg = transferCodec.args.asCandid(displayTransferArg)
    console.log("Candid TransferArg:", candidTransferArg)

    // ═══════════════════════════════════════════════════════════════════════
    // Step 4: Format output for display
    // ═══════════════════════════════════════════════════════════════════════

    const formatCandidValue = (value: any, type: string): string => {
      if (value === undefined || value === null) return "undefined"
      if (type === "principal") {
        return `Principal("${value.toText?.() || value}")`
      }
      if (type === "bigint") {
        return `${value}n`
      }
      if (type === "opt") {
        if (Array.isArray(value) && value.length === 0) return "[]"
        if (Array.isArray(value) && value.length === 1) {
          const inner = value[0]
          if (inner instanceof Uint8Array)
            return `[Uint8Array(${inner.length})]`
          if (typeof inner === "bigint") return `[${inner}n]`
          return `[${JSON.stringify(inner)}]`
        }
        return JSON.stringify(value)
      }
      return JSON.stringify(value)
    }

    const candidResult = {
      to: {
        owner: formatCandidValue(candidTransferArg?.to?.owner, "principal"),
        subaccount: formatCandidValue(candidTransferArg?.to?.subaccount, "opt"),
      },
      amount: formatCandidValue(candidTransferArg?.amount, "bigint"),
      fee: formatCandidValue(candidTransferArg?.fee, "opt"),
      memo: formatCandidValue(candidTransferArg?.memo, "opt"),
      from_subaccount: formatCandidValue(
        candidTransferArg?.from_subaccount,
        "opt"
      ),
      created_at_time: formatCandidValue(
        candidTransferArg?.created_at_time,
        "opt"
      ),
    }

    const formatForDisplay = (obj: any, indent = 2): string => {
      const spaces = " ".repeat(indent)
      const lines: string[] = ["{"]

      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          lines.push(`${spaces}${key}: ${formatForDisplay(value, indent + 2)}`)
        } else if (value === null || value === undefined) {
          lines.push(`${spaces}${key}: null`)
        } else if (typeof value === "string") {
          lines.push(`${spaces}${key}: "${value}"`)
        } else {
          lines.push(`${spaces}${key}: ${value}`)
        }
      }

      lines.push(" ".repeat(indent - 2) + "}")
      return lines.join("\n")
    }

    displayArgsEl.textContent = formatForDisplay(displayTransferArg)
    candidArgsEl.textContent = formatForDisplay(candidResult)

    // ═══════════════════════════════════════════════════════════════════════
    // Step 5: Show transformation details
    // ═══════════════════════════════════════════════════════════════════════

    const transformations = [
      "═══════════════════════════════════════════════════════════",
      "🔴 CODEC TRANSFORMATION (using reactor.getCodec)",
      "═══════════════════════════════════════════════════════════",
      "",
      "The conversion above uses the codec from DisplayReactor:",
      "  const transferCodec = reactor.getCodec('icrc1_transfer')",
      "  const candid = transferCodec.args.asCandid(displayArgs)",
      "",
      "═══════════════════════════════════════════════════════════",
      "TRANSFORMATION DETAILS",
      "═══════════════════════════════════════════════════════════",
      "",
      "📌 Principal:",
      `   "${principalText}" → ${candidResult.to.owner}`,
      `   string → Principal object`,
      "",
      "📌 Amount (bigint ↔ string):",
      `   "${amountText}" → ${candidResult.amount}`,
      `   string → bigint`,
      "",
      "📌 Subaccount (Opt<blob> ↔ string | null):",
      displayTransferArg.to.subaccount
        ? `   "${displayTransferArg.to.subaccount.slice(0, 20)}..." → ${candidResult.to.subaccount}`
        : `   null → []`,
      `   Note: null → [] (absent), value → [value] (present)`,
      "",
      "📌 Fee (Opt<nat> ↔ string | null):",
      displayTransferArg.fee
        ? `   "${displayTransferArg.fee}" → ${candidResult.fee}`
        : `   null → []`,
      "",
      "═══════════════════════════════════════════════════════════",
      "KEY INSIGHT: DisplayReactor does this automatically!",
      "═══════════════════════════════════════════════════════════",
      "",
      "With DisplayReactor, you just pass Display format args",
      "and the codec converts them before sending to the canister.",
      "",
      "await reactor.callMethod({",
      "  functionName: 'icrc1_transfer',",
      "  args: [displayTransferArg]  // Uses Display format!",
      "})",
    ]

    encodedResult.textContent = transformations.join("\n")
  } catch (error) {
    encodedResult.textContent = `Error: ${(error as Error).message}`
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatObject(
  obj: Record<string, unknown>,
  format: "candid" | "display"
): string {
  const formatValue = (value: unknown, depth = 0): string => {
    const indent = "  ".repeat(depth)
    const childIndent = "  ".repeat(depth + 1)

    if (value === null || value === undefined) {
      return format === "candid" ? "[]" : "null"
    }

    if (typeof value === "bigint") {
      return format === "candid" ? `${value}n` : `"${value}"`
    }

    if (value instanceof Principal) {
      return format === "candid" ? `Principal { ... }` : `"${value.toText()}"`
    }

    if (value instanceof Uint8Array) {
      if (format === "candid") {
        return `Uint8Array(${value.length}) [${Array.from(value.slice(0, 4)).join(", ")}...]`
      }
      return `"0x${Array.from(value)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}"`
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return "[]"
      const items = value.map((v) => formatValue(v, depth + 1))
      return `[\n${childIndent}${items.join(`,\n${childIndent}`)}\n${indent}]`
    }

    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>)
      if (entries.length === 0) return "{}"
      const formatted = entries
        .map(([k, v]) => `${childIndent}${k}: ${formatValue(v, depth + 1)}`)
        .join(",\n")
      return `{\n${formatted}\n${indent}}`
    }

    if (typeof value === "string") {
      return `"${value}"`
    }

    return String(value)
  }

  return formatValue(obj)
}

function formatLargeNumber(value: number, decimals: number): string {
  const actualValue = value / Math.pow(10, decimals)

  if (actualValue >= 1e12) {
    return `${(actualValue / 1e12).toFixed(2)}T`
  } else if (actualValue >= 1e9) {
    return `${(actualValue / 1e9).toFixed(2)}B`
  } else if (actualValue >= 1e6) {
    return `${(actualValue / 1e6).toFixed(2)}M`
  } else if (actualValue >= 1e3) {
    return `${(actualValue / 1e3).toFixed(2)}K`
  }

  return actualValue.toFixed(2)
}

/**
 * Demonstrates automatic Result unwrapping with a real transfer call.
 * Shows how { Ok, Err } variants are handled by DisplayReactor.
 */
async function simulateResultUnwrapping() {
  const results: string[] = []

  resultDemoOutput.textContent = "Making real transfer call (will fail)..."

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 1: Real Transfer Call with DisplayReactor
  // ═══════════════════════════════════════════════════════════════════════════
  results.push("═══════════════════════════════════════════════════════════")
  results.push("🔴 LIVE TEST: Real icrc1_transfer Call (Will Fail)")
  results.push("═══════════════════════════════════════════════════════════")
  results.push("")

  // DisplayReactor automatically:
  // 1. Transforms Candid → Display types
  // 2. Unwraps Result { Ok, Err } → returns Ok value or throws CanisterError
  const displayReactor = new DisplayReactor<Ledger>({
    clientManager,
    canisterId: activeCanisterId,
    idlFactory,
    name: "transfer-test",
  })

  const actorName = getActorNameByCanisterId(activeCanisterId)
  results.push(`Token: ${actorName} (${activeCanisterId})`)
  results.push("")
  results.push("DisplayReactor automatically:")
  results.push("  • Transforms bigint → string")
  results.push("  • Transforms Principal → string")
  results.push("  • Unwraps { Ok: T } → returns T directly")
  results.push("  • Throws CanisterError on { Err: E }")
  results.push("")

  const owner = (await clientManager.getUserPrincipal()).toString()
  // Try to transfer more than we have
  const hugeAmount = "999999999999999999999"
  const transferArgs = {
    to: {
      owner,
      subaccount: null,
    },
    amount: hugeAmount,
    fee: null,
    memo: null,
    from_subaccount: null,
    created_at_time: null,
  }

  results.push("Transfer arguments (Display format):")
  results.push(`  to.owner: "${owner}"`)
  results.push(`  amount: "${hugeAmount}"`)
  results.push(`  (trying to send way more than ${owner} has!)`)
  results.push("")

  try {
    results.push(
      "Calling displayReactor.callMethod({ functionName: 'icrc1_transfer', ... })"
    )
    results.push("")

    // This WILL fail with InsufficientFunds error
    const txId = await displayReactor.callMethod({
      functionName: "icrc1_transfer",
      args: [transferArgs],
    })

    // This line should never execute
    results.push(`✅ Success (unexpected): Transaction ID = ${txId}`)
  } catch (error: unknown) {
    results.push("❌ CanisterError THROWN (as expected!):")
    results.push("")

    if (error instanceof CanisterError) {
      results.push(`Error type: CanisterError`)
      results.push(`Error message: ${error.message}`)
      results.push(`Error code: ${error.code}`)
      results.push(`Error value:`)
      const errorStr = JSON.stringify(
        error.err,
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
        2
      )
      results.push(errorStr)
    } else {
      results.push(String(error))
    }

    results.push("")
    results.push("═══════════════════════════════════════════════════════════")
    results.push("💡 WHAT HAPPENED:")
    results.push("═══════════════════════════════════════════════════════════")
    results.push("")
    results.push("1. We called icrc1_transfer with a huge amount")
    results.push(
      "2. The canister returned: { Err: { InsufficientFunds: { balance: ... } } }"
    )
    results.push("3. DisplayReactor transformed bigint → string")
    results.push("4. extractOkResult() detected the Err variant")
    results.push("5. It THREW a CanisterError automatically")
    results.push("")
    results.push("Handle errors in your app:")
    results.push("")
    results.push("  import { CanisterError } from '@ic-reactor/core'")
    results.push("")
    results.push("  try {")
    results.push(
      "    const txId = await reactor.callMethod({ functionName: 'icrc1_transfer', ... })"
    )
    results.push("    console.log('Success:', txId)")
    results.push("  } catch (err) {")
    results.push("    if (err instanceof CanisterError) {")
    results.push("      if ('InsufficientFunds' in err.err) {")
    results.push(
      "        console.error('Not enough balance:', err.err.InsufficientFunds.balance)"
    )
    results.push("      }")
    results.push("    }")
    results.push("  }")
  }

  results.push("")
  results.push("")

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 2: Comparison with standard Actor
  // ═══════════════════════════════════════════════════════════════════════════
  results.push("═══════════════════════════════════════════════════════════")
  results.push("🔵 COMPARISON: Standard Actor from @icp-sdk/core")
  results.push("═══════════════════════════════════════════════════════════")
  results.push("")
  results.push("Standard Actor returns the full Result object.")
  results.push("It does NOT throw on Err (unlike DisplayReactor).")
  results.push("")

  const transferCodec = displayReactor.getCodec("icrc1_transfer")
  const candidTransferArgs = transferCodec?.args.asCandid(transferArgs)!

  const regularActor = Actor.createActor<Ledger>(idlFactory, {
    canisterId: activeCanisterId,
    agent: clientManager.agent,
  })

  try {
    const result = await regularActor.icrc1_transfer(candidTransferArgs)

    results.push("✅ Call Successful (Returned Result Object):")
    results.push("")
    results.push(
      JSON.stringify(result, (_, v) => (typeof v === "bigint" ? `${v}n` : v), 2)
    )
    results.push("")
    results.push("Notice: It returned { Err: ... } instead of throwing!")
  } catch (error: any) {
    results.push("❌ Unexpected Error: " + error.message)
  }

  resultDemoOutput.textContent = results.join("\n")
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

tokenSelect.addEventListener("change", () => {
  fetchTokenInfo(tokenSelect.value).then(() => {
    handleEncode()
  })
})

simulateResultBtn.addEventListener("click", simulateResultUnwrapping)

// Auto-transform on every interaction
const autoInputs = [
  "#principal-input",
  "#amount-input",
  "#subaccount-input",
  "#fee-input",
  "#memo-input",
]

autoInputs.forEach((selector) => {
  const el = document.querySelector<HTMLInputElement>(selector)
  if (el) {
    el.addEventListener("input", handleEncode)
  }
})

// Optional field toggles
const setupOptionalToggle = (
  toggleId: string,
  inputId: string,
  groupId: string
) => {
  const toggle = document.querySelector<HTMLInputElement>(`#${toggleId}`)
  const input = document.querySelector<HTMLInputElement>(`#${inputId}`)
  const group = document.querySelector<HTMLDivElement>(`#${groupId}`)

  if (toggle && input && group) {
    toggle.addEventListener("change", () => {
      input.disabled = !toggle.checked
      if (toggle.checked) {
        group.classList.add("enabled")
      } else {
        group.classList.remove("enabled")
      }
      handleEncode()
    })
  }
}

setupOptionalToggle("subaccount-toggle", "subaccount-input", "subaccount-group")
setupOptionalToggle("fee-toggle", "fee-input", "fee-group")
setupOptionalToggle("memo-toggle", "memo-input", "memo-group")

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

demonstrateTransformations()
fetchTokenInfo(ledgerCanisterId).then(() => {
  handleEncode()
})

console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  IC Reactor v3 - Codec Demo                                               ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  This demo showcases automatic type transformations:                      ║
║                                                                           ║
║  CANDID FORMAT (Backend)          DISPLAY FORMAT (Frontend)               ║
║  ─────────────────────────────    ─────────────────────────────           ║
║  bigint                    ↔      string                                  ║
║  Principal                 ↔      string (text representation)            ║
║  Uint8Array                ↔      hex string                              ║
║  [] | [T]                  ↔      T | null                                ║
║  { Key: value }            ↔      { _type: "Key", Key?: value }           ║
║  { Ok: T } | { Err: E }    →      T (throws CanisterError on Err)         ║
║                                                                           ║
║  Use DisplayReactor for automatic transformations!                        ║
╚═══════════════════════════════════════════════════════════════════════════╝
`)
