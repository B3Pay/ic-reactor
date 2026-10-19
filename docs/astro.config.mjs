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
      // The family mark alone: the library switcher beside it names the
      // library, so the lockup's name would say it twice.
      logo: {
        light: "./src/assets/ic-reactor-mark-light.svg",
        dark: "./src/assets/ic-reactor-mark-dark.svg",
        alt: "IC Reactor docs home",
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
        // The share image: the B3Pay design system's social card, from
        // assets/logos/ic-reactor. Starlight already sets twitter:card to
        // summary_large_image.
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content:
              "https://ic-reactor.b3pay.net/v4/ic-reactor-social-card.png",
          },
        },
        { tag: "meta", attrs: { property: "og:image:width", content: "1280" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "640" } },
        {
          tag: "meta",
          attrs: { property: "og:image:alt", content: "IC Reactor" },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image",
            content:
              "https://ic-reactor.b3pay.net/v4/ic-reactor-social-card.png",
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
      // One library's sidebar, in the sections every library on the site
      // shares: Get started, Guides, Concepts, Reference and Examples. Build
      // holds the site's step-by-step apps, which may use several libraries.
      sidebar: [
        {
          label: "Get started",
          items: [
            { label: "Overview", slug: "ic-reactor" },
            { label: "Getting started", slug: "guides/getting-started" },
            { label: "Migrating from 3.x", slug: "migrating-from-3" },
          ],
        },
        {
          label: "Build",
          items: [
            { label: "An ICRC-1 wallet", slug: "build/icrc1-wallet" },
            { label: "A server page for one user", slug: "build/ssr-per-user" },
          ],
        },
        {
          label: "Guides",
          items: [
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
          label: "Concepts",
          items: [
            { label: "The client", slug: "guides/client" },
            { label: "Values and units", slug: "guides/values" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "@ic-reactor/core", slug: "packages/core" },
            { label: "@ic-reactor/react", slug: "packages/react" },
            { label: "@ic-reactor/vite-plugin", slug: "packages/vite-plugin" },
            {
              label: "API reference",
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
