import { jsonToString } from "@ic-reactor/core/dist/utils"
import {
  createCandidAdapter,
  createAgentManager,
  createReactorCore,
} from "@ic-reactor/core"
import { Principal } from "@dfinity/principal"

let previousActorCleanup = null
let balanceUnsub = null
let transferUnsub = null

const canisterForm = document.getElementById("canisterForm")

document.addEventListener("DOMContentLoaded", function () {
  canisterForm.addEventListener("submit", renderResult, false)
})

const canisterIdInput = document.getElementById("canisterIdInput")
const networkSelect = document.getElementById("networkSelect")
const userPara = document.getElementById("user")
const loginButton = document.getElementById("loginButton")
const resultDiv = document.getElementById("result")
const userForm = document.getElementById("userForm")
const balanceDiv = document.getElementById("balance")
const transferForm = document.getElementById("transferForm")
const transferResult = document.getElementById("transferResult")

const agentManager = createAgentManager({ withDevtools: true })
const candidAdapter = createCandidAdapter({ agentManager })

agentManager.subscribeAuthState(
  ({ identity, authenticating, authenticated }) => {
    const userPrincipal = identity?.getPrincipal().toText()
    loginButton.textContent = authenticating
      ? "Authenticating..."
      : authenticated
      ? "Logout"
      : "Login"
    loginButton.onclick = () => {
      if (authenticated) {
        agentManager.logout()
      } else {
        agentManager.login()
      }
    }
    userPara.textContent = `${userPrincipal || "Not logged in"}`
  }
)

agentManager.authenticate()

const reactor = async () => {
  agentManager.updateAgent({
    host:
      networkSelect.value === "local"
        ? "http://localhost:4943"
        : "https://ic0.app",
  })

  const canisterId = canisterIdInput.value

  resultDiv.innerHTML = `Loading ${canisterId}`
  const { idlFactory } = await candidAdapter.getCandidDefinition(canisterId)
  resultDiv.innerHTML = `Loaded ${canisterId}`

  return createReactorCore({
    agentManager,
    canisterId,
    idlFactory,
  })
}

const renderResult = async (event) => {
  event.preventDefault()
  previousActorCleanup?.()

  reactor().then(({ getPrincipal, queryCall, updateCall, cleanup }) => {
    previousActorCleanup = cleanup
    resultDiv.innerHTML = ""
    balanceDiv.innerHTML = ""

    // Function names as per your React component
    const functionNames = [
      "icrc1_decimals",
      "icrc1_fee",
      "icrc1_metadata",
      "icrc1_minting_account",
      "icrc1_name",
      "icrc1_supported_standards",
      "icrc1_symbol",
      "icrc1_total_supply",
    ]

    functionNames.forEach(async (functionName) => {
      const { subscribe, call } = queryCall({ functionName })
      const container = document.createElement("div")
      container.className = "flex-row"
      const resultPara = document.createElement("p")

      const refreshButton = document.createElement("button")
      refreshButton.textContent = "↻"
      refreshButton.onclick = () => call()

      container.appendChild(refreshButton)
      container.appendChild(resultPara)

      subscribe(({ data, loading, error }) => {
        resultPara.textContent = loading
          ? "Loading..."
          : error
          ? `Error: ${error.message}`
          : `${functionName}: ${jsonToString(data)}`
      })

      resultDiv.appendChild(container)
    })

    userForm.style.display = "flex"

    const owner = getPrincipal()

    const { subscribe: balanceSubscribe, call: balanceCall } = queryCall({
      functionName: "icrc1_balance_of",
      args: [{ owner, subaccount: [] }],
    })

    const { subscribe: transferSubscribe, call: transferCall } = updateCall({
      functionName: "icrc1_transfer",
    })

    const refreshButton = document.createElement("button")
    refreshButton.textContent = "↻"
    refreshButton.onclick = () => balanceCall()

    balanceDiv.appendChild(refreshButton)

    const balancePara = document.createElement("p")
    balanceDiv.appendChild(balancePara)

    balanceUnsub = balanceSubscribe(({ data, loading, error }) => {
      balancePara.innerHTML = loading
        ? "Loading..."
        : error
        ? `Error: ${error.message}`
        : jsonToString(data)
    })

    transferUnsub = transferSubscribe(({ data, loading, error }) => {
      transferResult.innerHTML = loading
        ? "Loading..."
        : error
        ? `Error: ${error.message}`
        : data
        ? `Transfer Result: ${jsonToString(data)}`
        : ""
    })

    transferForm.addEventListener("submit", (event) => {
      event.preventDefault()

      const owner = Principal.fromText(event.target.elements.to.value)
      const amount = BigInt(event.target.elements.amount.value)

      transferCall([
        {
          to: { owner, subaccount: [] },
          amount,
          created_at_time: [],
          fee: [],
          memo: [],
          from_subaccount: [],
        },
      ])
    })
  })
}
