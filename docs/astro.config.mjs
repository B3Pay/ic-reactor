import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"
import starlightPageActions from "starlight-page-actions"

export default defineConfig({
  site: "https://ic-reactor.b3pay.net",
  base: "/v4/",
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
        { label: "Overview", link: "/" },
        {
          label: "Guides",
          items: [
            { label: "Getting started", slug: "guides/getting-started" },
            { label: "The client", slug: "guides/client" },
            { label: "Values and units", slug: "guides/values" },
            { label: "Reads", slug: "guides/reads" },
            { label: "Writes", slug: "guides/writes" },
            { label: "Errors and mayHaveExecuted", slug: "guides/errors" },
            { label: "Auth", slug: "guides/auth" },
            { label: "SSR and hydration", slug: "guides/ssr" },
            { label: "Testing", slug: "guides/testing" },
            { label: "The Vite plugin", slug: "guides/vite-plugin" },
          ],
        },
        {
          label: "Packages",
          items: [
            { label: "@ic-reactor/core", slug: "packages/core" },
            { label: "@ic-reactor/react", slug: "packages/react" },
            { label: "@ic-reactor/vite-plugin", slug: "packages/vite-plugin" },
          ],
        },
        {
          label: "Examples",
          items: [
            { label: "All examples", slug: "examples" },
            { label: "ICRC-1 ledger", slug: "examples/icrc-ledger" },
            { label: "Next.js SSR", slug: "examples/next-ssr" },
            { label: "Vite wallet", slug: "examples/vite-wallet" },
            { label: "Node agent tool", slug: "examples/node-agent-tool" },
          ],
        },
        { label: "Migrating from 3.x", slug: "migrating-from-3" },
        {
          label: "API Reference",
          collapsed: true,
          items: [
            { label: "Overview", link: "/libs" },
            {
              label: "Classes",
              collapsed: true,
              items: [{ autogenerate: { directory: "libs/classes" } }],
            },
            {
              label: "Functions",
              collapsed: true,
              items: [{ autogenerate: { directory: "libs/functions" } }],
            },
            {
              label: "Interfaces",
              collapsed: true,
              items: [{ autogenerate: { directory: "libs/interfaces" } }],
            },
            {
              label: "Type Aliases",
              collapsed: true,
              items: [{ autogenerate: { directory: "libs/type-aliases" } }],
            },
            {
              label: "Variables",
              collapsed: true,
              items: [{ autogenerate: { directory: "libs/variables" } }],
            },
          ],
        },
      ],
      customCss: ["./src/styles/custom.css"],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
      },
    }),
  ],
})
