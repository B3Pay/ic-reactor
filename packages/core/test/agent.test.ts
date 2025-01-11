import { IC_HOST_NETWORK_URI } from "../src/utils"
import { createAgentManager } from "../src"
import { AgentState } from "../dist/types"

describe("My IC Network agent", () => {
  describe("with initialization disabled", () => {
    const agentManager = createAgentManager({
      host: IC_HOST_NETWORK_URI,
      initializeOnCreate: false,
    })

    it("should start with uninitialized state", () => {
      const state = agentManager.getAgentState()
      expect(state.initialized).toBe(false)
      expect(state.initializing).toBe(false)
    })

    it("should subscribe to agent state changes during initialization", (done) => {
      const { subscribeAgentState } = agentManager
      let stateChanges: Partial<AgentState>[] = []

      const unsubscribe = subscribeAgentState((state) => {
        stateChanges.push({
          initialized: state.initialized,
          initializing: state.initializing,
          network: state.network,
        })

        // We expect these state transitions:
        // 1. initializing: true
        // 2. initialized: true, initializing: false
        if (stateChanges.length === 2) {
          try {
            expect(stateChanges[0]).toEqual({
              initialized: false,
              initializing: true,
              network: "ic",
            })
            expect(stateChanges[1]).toEqual({
              initialized: true,
              initializing: false,
              network: "ic",
            })
            unsubscribe()
            done()
          } catch (error) {
            done(error)
          }
        }
      })

      agentManager.initializeAgent()
    })
  })

  describe("with initialization enabled", () => {
    const agentManager = createAgentManager({
      host: IC_HOST_NETWORK_URI,
      initializeOnCreate: true,
    })

    it("should start with initialized state", () => {
      const state = agentManager.getAgentState()
      expect(state.initialized).toBe(true)
      expect(state.initializing).toBe(false)
      expect(state.network).toBe("ic")
    })

    it("should subscribe to initialized state changes", (done) => {
      const { subscribeAgentState } = agentManager

      const unsubscribe = subscribeAgentState(
        (state) => state.initialized,
        (isInitialized, prevIsInitialized) => {
          try {
            expect(prevIsInitialized).toBe(true)
            expect(isInitialized).toBe(false)
            unsubscribe()
            done()
          } catch (error) {
            done(error)
          }
        }
      )

      agentManager["updateAgentState"]({ initialized: false })
    })
  })
})

describe("My Local Network agent", () => {
  describe("with initialization disabled and error", () => {
    const agentManager = createAgentManager({
      withLocalEnv: true,
      initializeOnCreate: false,
    })

    it("should start with uninitialized state", () => {
      const state = agentManager.getAgentState()
      expect(state.initialized).toBe(false)
      expect(state.initializing).toBe(false)
      expect(state.network).toBe(undefined)
    })

    it("should track initialization states", (done) => {
      const { subscribeAgentState } = agentManager
      let stateChanges: Partial<AgentState>[] = []

      const unsubscribe = subscribeAgentState((state) => {
        stateChanges.push(state)

        if (stateChanges.length === 2) {
          try {
            // First change: starting initialization
            expect(stateChanges[0]).toEqual({
              initialized: false,
              initializing: true,
              network: "local",
            })
            // Second change: initialization complete
            expect(stateChanges[1].error?.message).toBe("fetch failed")
            done()
          } catch (error) {
            done(error)
          }
        }
      })

      agentManager.initializeAgent().then(unsubscribe)
    })
  })

  describe("with initialization enabled", () => {
    const agentManager = createAgentManager()

    it("should start with initialized state", () => {
      const state = agentManager.getAgentState()
      expect(state.initialized).toBe(true)
      expect(state.initializing).toBe(false)
      expect(state.network).toBe("ic")
    })

    it("should handle error states", (done) => {
      const { subscribeAgentState } = agentManager

      const unsubscribe = subscribeAgentState(
        (state) => state.error,
        (error, prevError) => {
          try {
            expect(prevError).toBeUndefined()
            expect(error?.message).toBe("fetch failed")
            done()
          } catch (error) {
            done(error)
          }
        }
      )

      agentManager.initializeAgent().then(() => {
        unsubscribe()
        done()
      })
    })
  })
})
