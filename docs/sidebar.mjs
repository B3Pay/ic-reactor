export const coreSidebar = [
  {
    label: "Getting Started",
    items: [
      { label: "Overview", link: "/" },
      { label: "Why IC Reactor", link: "/getting-started/why-ic-reactor" },
      { label: "Installation", link: "/getting-started/installation" },
      { label: "Quick Start", link: "/getting-started/quick-start" },
      {
        label: "Local Development",
        link: "/getting-started/local-development",
      },
    ],
  },
  {
    label: "Framework",
    items: [
      { label: "React Setup", link: "/framework/react-setup" },
      { label: "Queries", link: "/framework/queries" },
      { label: "Mutations", link: "/framework/mutations" },
      { label: "Query Caching", link: "/framework/query-caching" },
    ],
  },
  {
    label: "Guides",
    items: [
      {
        label: "Authentication",
        link: "/guides/authentication",
      },
      { label: "Type Safety", link: "/guides/type-safety" },
      { label: "Error Handling", link: "/guides/error-handling" },
      { label: "AI Friendliness", link: "/guides/ai-friendliness" },
    ],
  },
  {
    label: "Reference",
    items: [
      { label: "ClientManager", link: "/reference/clientmanager" },
      { label: "Reactor", link: "/reference/reactor" },
      { label: "DisplayReactor", link: "/reference/displayreactor" },
      {
        label: "createAuthHooks",
        items: [
          { label: "Overview", link: "/reference/createauthhooks/overview" },
          { label: "useAuth", link: "/reference/createauthhooks/useauth" },
          {
            label: "useUserPrincipal",
            link: "/reference/createauthhooks/useuserprincipal",
          },
          {
            label: "useAgentState",
            link: "/reference/createauthhooks/useagentstate",
          },
        ],
      },
      {
        label: "createActorHooks",
        items: [
          { label: "Overview", link: "/reference/createactorhooks/overview" },
          {
            label: "useActorQuery",
            link: "/reference/createactorhooks/useactorquery",
          },
          {
            label: "useActorMutation",
            link: "/reference/createactorhooks/useactormutation",
          },
          {
            label: "useActorSuspenseQuery",
            link: "/reference/createactorhooks/useactorsuspensequery",
          },
          {
            label: "useActorInfiniteQuery",
            link: "/reference/createactorhooks/useactorinfinitequery",
          },
          {
            label: "useActorSuspenseInfiniteQuery",
            link: "/reference/createactorhooks/useactorsuspenseinfinitequery",
          },
        ],
      },
      {
        label: "Factories",
        items: [
          { label: "Overview", link: "/reference/factories/overview" },
          { label: "createQuery", link: "/reference/factories/createquery" },
          {
            label: "createSuspenseQuery",
            link: "/reference/factories/createsuspensequery",
          },
          {
            label: "createMutation",
            link: "/reference/factories/createmutation",
          },
          {
            label: "createInfiniteQuery",
            link: "/reference/factories/createinfinitequery",
          },
          {
            label: "createSuspenseInfiniteQuery",
            link: "/reference/factories/createsuspenseinfinitequery",
          },
        ],
      },
      { label: "Validation", link: "/reference/reactvalidation" },
    ],
  },
  {
    label: "Examples",
    items: [
      { label: "Overview", link: "/examples" },
      { label: "All-in-One Demo", link: "/examples/all-in-one-demo" },
      { label: "TanStack Router", link: "/examples/tanstack-router" },
      { label: "Next.js Integration", link: "/examples/nextjs" },
      { label: "Query Demo", link: "/examples/query-demo" },
      { label: "Infinite Query", link: "/examples/infinite-query" },
      { label: "Multiple Canisters", link: "/examples/multiple-canister" },
      { label: "ckBTC Wallet", link: "/examples/ckbtc-wallet" },
      { label: "Custom Provider", link: "/examples/custom-provider" },
      { label: "Codec Demo", link: "/examples/codec-demo" },
      { label: "TypeScript Demo", link: "/examples/typescript-demo" },
    ],
  },
  {
    label: "API Reference",
    collapsed: true,
    items: [
      { label: "Overview", link: "/libs" },
      {
        label: "Classes",
        collapsed: true,
        autogenerate: { directory: "libs/classes" },
      },
      {
        label: "Functions",
        collapsed: true,
        autogenerate: { directory: "libs/functions" },
      },
      {
        label: "Interfaces",
        collapsed: true,
        autogenerate: { directory: "libs/interfaces" },
      },
      {
        label: "Type Aliases",
        collapsed: true,
        autogenerate: { directory: "libs/type-aliases" },
      },
      {
        label: "Variables",
        collapsed: true,
        autogenerate: { directory: "libs/variables" },
      },
    ],
  },
]

export const candidSidebar = {
  label: "@ic-reactor/candid",
  items: [
    { label: "Overview", link: "/packages/candid/" },
    { label: "CandidReactor", link: "/packages/candid/candidreactor" },
    { label: "CandidAdapter", link: "/packages/candid/candidadapter" },
  ],
}

export const parserSidebar = {
  label: "@ic-reactor/parser",
  items: [
    { label: "Overview", link: "/packages/parser/" },
    { label: "API Reference", link: "/packages/parser/reference" },
  ],
}
