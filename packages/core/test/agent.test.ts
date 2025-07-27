import { describe, it, expect } from "bun:test"
import { IC_HOST_NETWORK_URI } from "../src/utils"
import { createAgentManager } from "../src"
import { AgentState } from "../src/types"

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
          expect(prevIsInitialized).toBe(true)
          expect(isInitialized).toBe(false)
          unsubscribe()
          done()
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
      expect(state.network).toBeUndefined()
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
              isInitialized: false,
              initializing: true,
              isInitializing: true,
              error: undefined,
              network: "local",
            })
            // Second change: initialization complete
            expect(stateChanges[1].error?.code.toErrorMessage()).toBe(
              "Failed to fetch HTTP request: Error: Unable to connect. Is the computer able to access the url?"
            )
            done()
          } catch (error) {
            done(error)
          }
        }
      })

      agentManager.initializeAgent().then(unsubscribe)
    })
  })

  describe("with complex subscription logic", () => {
    const agentManager = createAgentManager({
      host: IC_HOST_NETWORK_URI,
      initializeOnCreate: false,
    })

    it("should start with uninitialized state", () => {
      const state = agentManager.getAgentState()
      expect(state.initialized).toBe(false)
      expect(state.initializing).toBe(false)
      expect(state.network).toBeUndefined()
    })

    it("should handle error states", (done) => {
      const { subscribeAgentState } = agentManager

      let callCount = 0

      const unsubscribe = subscribeAgentState(
        (state) => state.initialized,
        (initialized, prevInitialized) => {
          callCount++
          if (callCount === 1) {
            expect(prevInitialized).toBe(false)
            expect(initialized).toBe(false)
          } else {
            expect(initialized).toBe(true)
            expect(prevInitialized).toBe(false)
            done()
          }
        },
        { fireImmediately: true }
      )

      agentManager.initializeAgent().then(unsubscribe)
    })
  })
})
