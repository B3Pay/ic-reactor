import { Reactor, ClientManager } from "@ic-reactor/core"
import { Principal } from "@icp-sdk/core/principal"
import { QueryClient } from "@tanstack/query-core"
import { ledgerIdlFactory, ledgerCanisterId } from "./declarations/ledger"
import "./style.css"
import type { Ledger } from "./declarations/ledger.type"

const queryClient = new QueryClient()

const clientManager = new ClientManager({
  withProcessEnv: true,
  queryClient,
})

const actorsRecord: Record<string, Reactor<Ledger>> = {
  ICP: new Reactor({
    clientManager,
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory: ledgerIdlFactory,
    name: "ICP",
  }),
  ckBTC: new Reactor({
    clientManager,
    canisterId: "mxzaz-hqaaa-aaaar-qaada-cai",
    idlFactory: ledgerIdlFactory,
    name: "ckBTC",
  }),
  ckETH: new Reactor({
    clientManager,
    canisterId: "ss2fx-dyaaa-aaaar-qacoq-cai",
    idlFactory: ledgerIdlFactory,
    name: "ckETH",
  }),
  ckUSDT: new Reactor({
    clientManager,
    canisterId: "cngnf-vqaaa-aaaar-qag4q-cai",
    idlFactory: ledgerIdlFactory,
    name: "ckUSDT",
  }),
  ckUSDC: new Reactor({
    clientManager,
    canisterId: "xevnm-gaaaa-aaaar-qafnq-cai",
    idlFactory: ledgerIdlFactory,
    name: "ckUSDC",
  }),
}

const actors = Object.values(actorsRecord)

let activeCanisterId = ledgerCanisterId
let currentLedgerActor = actorsRecord.ICP

const tokenSelect = document.querySelector<HTMLSelectElement>("#token-select")!
const canisterIdInput =
  document.querySelector<HTMLInputElement>("#canister-id-input")!
const updateTokenBtn =
  document.querySelector<HTMLButtonElement>("#update-token-btn")!

// Populate token select options
actors.forEach((actor) => {
  if (actor.name.includes("-")) return
  const option = document.createElement("option")
  option.value = actor.canisterId.toText()
  option.textContent = actor.name
  tokenSelect.insertBefore(option, tokenSelect.lastElementChild)
})
canisterIdInput.value = ledgerCanisterId

const loginBtn = document.querySelector<HTMLButtonElement>("#login-btn")!
const authStatus = document.querySelector<HTMLDivElement>("#auth-status")!
const principalDisplay =
  document.querySelector<HTMLDivElement>("#principal-display")!
const tokenNameEl = document.querySelector<HTMLSpanElement>("#token-name")!
const tokenSymbolEl = document.querySelector<HTMLSpanElement>("#token-symbol")!
const tokenDecimalsEl =
  document.querySelector<HTMLSpanElement>("#token-decimals")!

const balanceCard = document.querySelector<HTMLDivElement>("#balance-card")!
const balanceDisplay =
  document.querySelector<HTMLDivElement>("#balance-display")!
const refreshBalanceBtn = document.querySelector<HTMLButtonElement>(
  "#refresh-balance-btn"
)!

const transferCard = document.querySelector<HTMLDivElement>("#transfer-card")!
const transferToInput =
  document.querySelector<HTMLInputElement>("#transfer-to")!
const transferAmountInput =
  document.querySelector<HTMLInputElement>("#transfer-amount")!
const transferBtn = document.querySelector<HTMLButtonElement>("#transfer-btn")!
const transferStatus =
  document.querySelector<HTMLDivElement>("#transfer-status")!

let tokenDecimals = 8
let tokenSymbol = "ICP"

async function updateToken(canisterId: string) {
  try {
    activeCanisterId = canisterId

    tokenNameEl.textContent = "Loading..."
    tokenSymbolEl.textContent = "Loading..."
    tokenDecimalsEl.textContent = "Loading..."
    balanceDisplay.textContent = "Loading..."

    // Use existing actor or register a new one
    const newActor =
      actorsRecord[canisterId] ||
      (actorsRecord[canisterId] = new Reactor<Ledger>({
        name: canisterId,
        clientManager,
        idlFactory: ledgerIdlFactory,
        canisterId,
      }))

    currentLedgerActor = newActor

    const info = await fetchLedgerInfo(newActor)

    // Check if we are still on the same token
    if (activeCanisterId !== canisterId) return

    tokenSymbol = info.symbol
    tokenDecimals = info.decimals

    tokenNameEl.textContent = info.name
    tokenSymbolEl.textContent = info.symbol
    tokenDecimalsEl.textContent = info.decimals.toString()

    const state = clientManager.authState
    const principal = state.identity?.getPrincipal()
    if (principal && !principal.isAnonymous()) {
      fetchBalance(principal, canisterId)
    }
  } catch (error) {
    console.error("Failed to update token:", error)
    if (activeCanisterId === canisterId) {
      tokenNameEl.textContent = "Error"
      tokenSymbolEl.textContent = "Error"
      tokenDecimalsEl.textContent = "Error"
      balanceDisplay.textContent = "Error"
    }
  }
}

// Query ledger info
async function fetchLedgerInfo(actor: Reactor<Ledger>) {
  const [name, symbol, decimals] = await Promise.all([
    actor.queryClient.fetchQuery({
      ...actor.getQueryOptions({ functionName: "icrc1_name" }),
      staleTime: Infinity,
    }),
    actor.queryClient.fetchQuery({
      ...actor.getQueryOptions({ functionName: "icrc1_symbol" }),
      staleTime: Infinity,
    }),
    actor.queryClient.fetchQuery({
      ...actor.getQueryOptions({ functionName: "icrc1_decimals" }),
      staleTime: Infinity,
    }),
  ])

  return {
    name: String(name),
    symbol: String(symbol),
    decimals: Number(decimals),
  }
}

async function fetchBalance(owner: Principal, canisterId: string) {
  try {
    if (activeCanisterId !== canisterId) return

    balanceDisplay.textContent = "Fetching..."

    const balance = await currentLedgerActor.queryClient.fetchQuery({
      ...currentLedgerActor.getQueryOptions({
        functionName: "icrc1_balance_of",
        args: [{ owner, subaccount: [] }],
      }),
      staleTime: 5000,
    })

    // Check again before updating UI
    if (activeCanisterId !== canisterId) return

    const balanceNum = Number(balance) / Math.pow(10, tokenDecimals)
    balanceDisplay.textContent = `${balanceNum} ${tokenSymbol}`
  } catch (error) {
    console.error("Failed to fetch balance:", error)
    if (activeCanisterId === canisterId) {
      balanceDisplay.textContent = "Error fetching balance"
    }
  }
}

tokenSelect.addEventListener("change", () => {
  const value = tokenSelect.value
  if (value !== "custom") {
    canisterIdInput.value = value
    updateToken(value)
  } else {
    canisterIdInput.value = ""
    canisterIdInput.focus()
  }
})

canisterIdInput.addEventListener("input", () => {
  tokenSelect.value = "custom"
})

updateTokenBtn.addEventListener("click", () => {
  const value = canisterIdInput.value
  if (value) {
    updateToken(value)
  }
})

refreshBalanceBtn.addEventListener("click", () => {
  const state = clientManager.authState
  const principal = state.identity?.getPrincipal()
  if (principal) {
    fetchBalance(principal, activeCanisterId)
  }
})

transferBtn.addEventListener("click", async () => {
  const to = transferToInput.value
  const amount = transferAmountInput.value

  if (!to || !amount) {
    transferStatus.textContent = "Please enter principal and amount"
    transferStatus.style.color = "#f87171"
    return
  }

  try {
    transferStatus.textContent = "Transferring..."
    transferStatus.style.color = "#fbbf24"

    const amountBigInt = BigInt(
      Math.floor(Number(amount) * Math.pow(10, tokenDecimals))
    )
    const principal = await clientManager.getUserPrincipal()

    const blockIndex = await currentLedgerActor.callMethod({
      functionName: "icrc1_transfer",
      args: [
        {
          to: { owner: Principal.fromText(to), subaccount: [] },
          amount: amountBigInt,
          fee: [],
          memo: [],
          created_at_time: [],
          from_subaccount: [],
        },
      ],
    })

    transferStatus.textContent = `Transfer successful! Height: ${blockIndex}`
    transferStatus.style.color = "#4ade80"
    currentLedgerActor.invalidateQueries()
    fetchBalance(principal, activeCanisterId)
    transferAmountInput.value = ""
    transferToInput.value = ""
  } catch (error) {
    transferStatus.textContent = `Transfer failed: ${JSON.stringify(
      error,
      (_, v) => (typeof v === "bigint" ? v.toString() : v)
    )}`
    transferStatus.style.color = "#f87171"
    console.error("Transfer error:", error)
    transferStatus.textContent = `Error: ${error}`
    transferStatus.style.color = "#f87171"
  }
})

// Subscribe to auth state
clientManager.subscribeAuthState((state) => {
  const principal = state.identity?.getPrincipal()
  if (state.isAuthenticating) {
    authStatus.textContent = "Authenticating..."
    authStatus.style.color = "#fbbf24"
    loginBtn.disabled = true
  } else if (principal && !principal.isAnonymous()) {
    authStatus.textContent = "Authenticated"
    authStatus.style.color = "#4ade80"
    loginBtn.textContent = "Logout"
    loginBtn.disabled = false
    principalDisplay.textContent = `Principal: ${principal.toText()}`

    // Show authenticated cards
    balanceCard.style.display = "block"
    transferCard.style.display = "block"

    fetchBalance(principal, activeCanisterId)
  } else {
    authStatus.textContent = "Not Authenticated"
    authStatus.style.color = "#facc15"
    loginBtn.textContent = "Login with Internet Identity"
    loginBtn.disabled = false
    principalDisplay.textContent = ""

    // Hide authenticated cards
    balanceCard.style.display = "none"
    transferCard.style.display = "none"
    balanceDisplay.textContent = "Loading..."
    transferStatus.textContent = ""
  }

  if (state.error) {
    console.error("Auth error:", state.error)
    authStatus.textContent = `Error: ${state.error.message}`
    authStatus.style.color = "#f87171"
  }
})

loginBtn.addEventListener("click", () => {
  if (clientManager.authState.isAuthenticated) {
    clientManager.logout()
  } else {
    clientManager.login()
  }
})

// Initial load
clientManager.initialize()
updateToken(activeCanisterId)
