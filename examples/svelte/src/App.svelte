<script>
  import { createReActor } from "@ic-reactor/svelte"
  import { onDestroy, onMount } from "svelte"
  import { createActor } from "./candid"

  const { actions, initializeActor, queryCall, updateCall } = createReActor(
    (agent) => createActor("xeka7-ryaaa-aaaal-qb57a-cai", { agent }),
    {
      host: "https://icp-api.io",
    },
  )

  let balance
  let isLoading

  // Call the queryCall method
  const { recall, subscribe, initialData, getState } = queryCall({
    functionName: "version",
    autoRefresh: true,
  })

  onMount(() => {
    // Subscribe to updates
    const unsubscribe = subscribe(({ data, loading }) => {
      balance = data
      isLoading = loading
    })

    // Fetch initial data
    initialData.then((data) => {
      balance = data
    })

    // Unsubscribe when the component is destroyed
    onDestroy(() => {
      if (unsubscribe) unsubscribe()
    })
  })
</script>

<!-- UI -->
{#if isLoading}
  <p>Loading...</p>
{:else}
  <p>Balance: {balance}</p>
{/if}
<button on:click={() => recall()}>Refresh Balance</button>
