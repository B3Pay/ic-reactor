import {
  Reactor,
  ClientManager,
  formatTokenAmount,
  isCanisterError,
  jsonToString,
  parseTokenAmount,
} from "@ic-reactor/react"
import { AuthenticationManager } from "@ic-reactor/react"
import { Principal } from "@icp-sdk/core/principal"
import { QueryClient } from "@tanstack/query-core"
import { ledgerIdlFactory } from "./declarations/ledger"
import "./style.css"
import type { Ledger } from "./declarations/ledger.type"

const queryClient = new QueryClient()
//@ts-ignore
window.__TANSTACK_QUERY_CLIENT__ = queryClient

const clientManager = new ClientManager({
  agentOptions: { host: "https://ic0.app" },
  queryClient,
})
const authentication = new AuthenticationManager({ clientManager })

const ledgerReactor = new Reactor<Ledger>({
  clientManager,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  idlFactory: ledgerIdlFactory,
  name: "Ledger",
})

const initialTokens = [
  { name: "ICP", canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai" },
  { name: "ckBTC", canisterId: "mxzaz-hqaaa-aaaar-qaada-cai" },
  { name: "ckETH", canisterId: "ss2fx-dyaaa-aaaar-qacoq-cai" },
  { name: "ckUSDT", canisterId: "cngnf-vqaaa-aaaar-qag4q-cai" },
  { name: "ckUSDC", canisterId: "xevnm-gaaaa-aaaar-qafnq-cai" },
]

let activeCanisterId = initialTokens[0].canisterId

const tokenSelect = document.querySelector<HTMLSelectElement>("#token-select")!
const canisterIdInput =
  document.querySelector<HTMLInputElement>("#canister-id-input")!
const updateTokenBtn =
  document.querySelector<HTMLButtonElement>("#update-token-btn")!

// Populate token select options
initialTokens.forEach((token) => {
  const option = document.createElement("option")
  option.value = token.canisterId
  option.textContent = token.name
  tokenSelect.appendChild(option)
})
tokenSelect.value = activeCanisterId
canisterIdInput.value = activeCanisterId

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

// The selected token's decimals, or undefined while they load: the reactor
// already calls the new canister by then, so the previous token's decimals
// would show and send the wrong amounts (ckETH has 18, ICP 8).
let tokenDecimals: number | undefined
let tokenSymbol = "ICP"

async function updateToken(canisterId: string) {
  try {
    activeCanisterId = canisterId
    tokenDecimals = undefined

    tokenNameEl.textContent = "Loading..."
    tokenSymbolEl.textContent = "Loading..."
    tokenDecimalsEl.textContent = "Loading..."
    balanceDisplay.textContent = "Loading..."

    // key update
    ledgerReactor.setCanisterId(canisterId)

    const [name, symbol, decimals] = await Promise.all([
      ledgerReactor.fetchQuery({ functionName: "icrc1_name" }),
      ledgerReactor.fetchQuery({ functionName: "icrc1_symbol" }),
      ledgerReactor.fetchQuery({ functionName: "icrc1_decimals" }),
    ])
    if (activeCanisterId !== canisterId) return

    tokenSymbol = symbol
    tokenDecimals = decimals
    tokenNameEl.textContent = name
    tokenSymbolEl.textContent = symbol
    tokenDecimalsEl.textContent = decimals.toString()

    const principal = await clientManager.getUserPrincipal()
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

async function fetchBalance(owner: Principal, canisterId: string) {
  try {
    if (activeCanisterId !== canisterId) return

    balanceDisplay.textContent = "Fetching..."

    const balance = await ledgerReactor.callMethod({
      functionName: "icrc1_balance_of",
      args: [{ owner, subaccount: [] }],
    })
    // Another token was selected meanwhile, or this one's decimals have not
    // loaded; updateToken fetches the balance again once they have.
    const decimals = tokenDecimals
    if (activeCanisterId !== canisterId || decimals === undefined) return

    // Exact at any size, where Number(balance) / 10 ** decimals is not.
    balanceDisplay.textContent = `${formatTokenAmount(balance, decimals)} ${tokenSymbol}`
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
  clientManager.getUserPrincipal().then((principal) => {
    fetchBalance(principal, activeCanisterId)
  })
})

transferBtn.addEventListener("click", async () => {
  const to = transferToInput.value
  const amount = transferAmountInput.value

  if (!to || !amount) {
    transferStatus.textContent = "Please enter principal and amount"
    transferStatus.style.color = "#f87171"
    return
  }
  const decimals = tokenDecimals
  if (decimals === undefined) {
    transferStatus.textContent = "Wait for the token's details to load"
    transferStatus.style.color = "#f87171"
    return
  }

  try {
    transferStatus.textContent = "Transferring..."
    transferStatus.style.color = "#fbbf24"

    // "0.29" is 29000000 e8s; Math.floor(Number("0.29") * 10 ** 8) is
    // 28999999. Throws on text it cannot read exactly, before anything is sent.
    // Nothing is awaited between reading the decimals and the call, so the
    // amount goes to the token it was read for.
    const amountBigInt = parseTokenAmount(amount, decimals)
    const blockIndex = await ledgerReactor.callMethod({
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

    const principal = await clientManager.getUserPrincipal()
    transferStatus.textContent = `Transfer successful! Height: ${blockIndex}`
    transferStatus.style.color = "#4ade80"
    ledgerReactor.invalidateQueries()
    fetchBalance(principal, activeCanisterId)
    transferAmountInput.value = ""
    transferToInput.value = ""
  } catch (error) {
    console.error("Transfer error:", error)
    // A ledger's TransferError holds bigints, which jsonToString writes as
    // digits (JSON.stringify throws on them).
    transferStatus.textContent = isCanisterError(error)
      ? `Transfer failed: ${jsonToString(error.err)}`
      : `Error: ${error}`
    transferStatus.style.color = "#f87171"
  }
})

loginBtn.addEventListener("click", () => {
  if (authentication.authState.isAuthenticated) {
    authentication.logout()
  } else {
    authentication.login()
  }
})

// Initial load
clientManager.initialize().then(() => {
  authentication.subscribeAuthState((state) => {
    updateToken(activeCanisterId)
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
})
