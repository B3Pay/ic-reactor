import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"
import starlightPageActions from "starlight-page-actions"

export default defineConfig({
  site: "https://ic-reactor.b3pay.net",
  base: "/v3/",
  output: "static",
  integrations: [
    starlight({
      title: "IC Reactor",
      logo: {
        src: "./src/assets/icon.svg",
      },
      plugins: [
        starlightPageActions({
          baseUrl: "https://ic-reactor.b3pay.net",
          actions: {
            chatgpt: true,
            claude: true,
            markdown: true,
          },
        }),
      ],
      description:
        "The modern, type-safe library for building Internet Computer applications",
      social: [
        {
          label: "GitHub",
          icon: "github",
          href: "https://github.com/b3pay/ic-reactor",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/b3pay/ic-reactor/edit/main/docs/",
      },
      head: [
        {
          tag: "meta",
          attrs: {
            name: "description",
            content:
              "The modern, type-safe library for building Internet Computer applications",
          },
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Overview", link: "/" },
            {
              label: "Why IC Reactor",
              link: "/getting-started/why-ic-reactor",
            },
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
              label: "CandidReactor",
              link: "/packages/candid/candidreactor",
            },
            {
              label: "CandidDisplayReactor",
              link: "/packages/candid/candiddisplayreactor",
            },
            {
              label: "MetadataReactor",
              link: "/packages/candid/metadatareactor",
            },
            {
              label: "MetadataDisplayReactor",
              link: "/packages/candid/metadatadisplayreactor",
            },
            {
              label: "createAuthHooks",
              items: [
                {
                  label: "Overview",
                  link: "/reference/createauthhooks/overview",
                },
                {
                  label: "useAuth",
                  link: "/reference/createauthhooks/useauth",
                },
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
                {
                  label: "Overview",
                  link: "/reference/createactorhooks/overview",
                },
                {
                  label: "useActorQuery",
                  link: "/reference/createactorhooks/useactorquery",
                },
                {
                  label: "useActorMutation",
                  link: "/reference/createactorhooks/useactormutation",
                },
                {
                  label: "useActorMethod",
                  link: "/reference/createactorhooks/useactormethod",
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
                {
                  label: "createQuery",
                  link: "/reference/factories/createquery",
                },
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
            {
              label: "Reactor Hooks",
              items: [
                {
                  label: "Overview",
                  link: "/reference/reactorhooks",
                },
                {
                  label: "useReactorQuery",
                  link: "/reference/reactorhooks/usereactorquery",
                },
                {
                  label: "useReactorMutation",
                  link: "/reference/reactorhooks/usereactormutation",
                },
                {
                  label: "useReactorMethod",
                  link: "/reference/reactorhooks/usereactormethod",
                },
                {
                  label: "useReactorSuspenseQuery",
                  link: "/reference/reactorhooks/usereactorsuspensequery",
                },
                {
                  label: "useReactorInfiniteQuery",
                  link: "/reference/reactorhooks/usereactorinfinitequery",
                },
                {
                  label: "useReactorSuspenseInfiniteQuery",
                  link: "/reference/reactorhooks/usereactorsuspenseinfinitequery",
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
            { label: "ICP Reactor Demo", link: "/examples/icp-reactor" },
            { label: "Query Demo", link: "/examples/query-demo" },
            { label: "Infinite Query", link: "/examples/infinite-query" },
            {
              label: "Result Types Demo",
              link: "/examples/result-types-demo",
            },
            {
              label: "Metadata Reactor Demo",
              link: "/examples/metadata-reactor",
            },
            { label: "Candid Parser", link: "/examples/candid-parser" },
            { label: "Vite Plugin Demo", link: "/examples/vite-plugin" },
            {
              label: "Vite Environment Variables",
              link: "/examples/vite-env",
            },
            {
              label: "Codegen in Action",
              link: "/examples/codegen-in-action",
            },
            { label: "TanStack Router", link: "/examples/tanstack-router" },
            { label: "TanStack Form Demo", link: "/examples/tanstack-form" },
            { label: "Next.js Integration", link: "/examples/nextjs" },
            {
              label: "Multiple Canisters",
              link: "/examples/multiple-canister",
            },
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
        {
          label: "Packages",
          items: [
            {
              label: "Overview",
              link: "/packages",
            },
            {
              label: "Runtime",
              items: [
                {
                  label: "@ic-reactor/react",
                  items: [
                    { label: "Overview", link: "/packages/react" },
                    { label: "React Setup", link: "/framework/react-setup" },
                    {
                      label: "createActorHooks",
                      link: "/reference/createactorhooks/overview",
                    },
                    {
                      label: "createAuthHooks",
                      link: "/reference/createauthhooks/overview",
                    },
                    {
                      label: "Reactor Hooks",
                      link: "/reference/reactorhooks",
                    },
                    {
                      label: "Factory Functions",
                      link: "/reference/factories/overview",
                    },
                  ],
                },
                {
                  label: "@ic-reactor/core",
                  items: [
                    { label: "Overview", link: "/packages/core" },
                    { label: "ClientManager", link: "/reference/clientmanager" },
                    { label: "Reactor", link: "/reference/reactor" },
                    {
                      label: "DisplayReactor",
                      link: "/reference/displayreactor",
                    },
                    { label: "Validation", link: "/reference/reactvalidation" },
                  ],
                },
                {
                  label: "@ic-reactor/candid",
                  items: [
                    { label: "Overview", link: "/packages/candid" },
                    {
                      label: "CandidReactor",
                      link: "/packages/candid/candidreactor",
                    },
                    {
                      label: "CandidDisplayReactor",
                      link: "/packages/candid/candiddisplayreactor",
                    },
                    {
                      label: "MetadataReactor",
                      link: "/packages/candid/metadatareactor",
                    },
                    {
                      label: "MetadataDisplayReactor",
                      link: "/packages/candid/metadatadisplayreactor",
                    },
                    {
                      label: "CandidAdapter",
                      link: "/packages/candid/candidadapter",
                    },
                    {
                      label: "CandidFormVisitor",
                      link: "/packages/candid/fieldvisitor",
                    },
                  ],
                },
                {
                  label: "@ic-reactor/parser",
                  items: [
                    { label: "Overview", link: "/packages/parser" },
                    { label: "API Reference", link: "/packages/parser/reference" },
                  ],
                },
              ],
            },
            {
              label: "Tooling",
              items: [
                {
                  label: "@ic-reactor/cli",
                  link: "/packages/cli",
                },
                {
                  label: "@ic-reactor/vite-plugin",
                  link: "/packages/vite-plugin",
                },
                {
                  label: "@ic-reactor/codegen",
                  link: "/packages/codegen",
                },
              ],
            },
          ],
        },
        {
          label: "Project",
          items: [{ label: "Contributing", link: "/contributing" }],
        },
      ],
      customCss: ["./src/styles/custom.css"],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
      },
    }),
  ],
})
