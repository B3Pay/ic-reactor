import { defineConfig, passthroughImageService } from "astro/config"
import starlight from "@astrojs/starlight"
import starlightPageActions from "starlight-page-actions"

export default defineConfig({
  site: "https://ic-reactor.b3pay.net",
  base: "/v4/",
  output: "static",
  // The only images are SVGs (the hero's mark), which need no optimizing, so
  // the build needs no sharp.
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: "IC Reactor",
      logo: {
        light: "./src/assets/ic-reactor-lockup-light.svg",
        dark: "./src/assets/ic-reactor-lockup-dark.svg",
        alt: "IC Reactor",
        replacesTitle: true,
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
        baseUrl: "https://github.com/b3pay/ic-reactor/edit/v4/docs/",
      },
      head: [
        // The B3Pay design system's type: Schibsted Grotesk and Martian Mono.
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Martian+Mono:wdth,wght@87.5..100,400..500&family=Schibsted+Grotesk:ital,wght@0,400;0,600;0,700;1,400&display=swap",
          },
        },
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
            { label: "Canister Studio", slug: "examples/canister-studio" },
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
      expressiveCode: {
        themes: ["vitesse-dark", "vitesse-light"],
        useStarlightUiThemeColors: true,
        styleOverrides: { borderRadius: "10px" },
      },
      customCss: ["./src/styles/custom.css"],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
      },
    }),
  ],
})
